import { NextRequest, NextResponse } from 'next/server';
import { getMetaToken } from '@/app/api/lib/tokens';
import { getProductProfile, getCreativeTests } from '@/app/api/lib/creative-hub-db';
import { getDb } from '@/app/api/lib/db';
import type { LaunchConfig, HealthCheck, PreLaunchReport } from '@/types/creativeHub';

interface CreativeTestItemRow {
  creative_name: string;
}

interface CreativeTestRow {
  id: string;
  product_profile_id: string;
  status: string;
}

/**
 * POST /api/creative-hub/launch/health-check
 *
 * Runs pre-launch validation checks against the launch configuration.
 * Returns a list of health checks and whether the launch can proceed.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { launchConfig: LaunchConfig; storeId: string };
    const { launchConfig, storeId } = body;

    if (!launchConfig || !storeId) {
      return NextResponse.json({ error: 'launchConfig and storeId are required' }, { status: 400 });
    }

    const checks: HealthCheck[] = [];

    // 1. Token valid
    const token = await getMetaToken(storeId);
    if (!token) {
      checks.push({
        check: 'token_valid',
        status: 'fail',
        message: 'Meta access token is missing or expired',
        details: 'Reconnect your Meta account in Settings to refresh the token.',
      });
    } else if (token.expiresAt && token.expiresAt < Date.now()) {
      checks.push({
        check: 'token_valid',
        status: 'fail',
        message: 'Meta access token has expired',
        details: `Token expired at ${new Date(token.expiresAt).toISOString()}. Reconnect Meta in Settings.`,
      });
    } else {
      checks.push({ check: 'token_valid', status: 'ok', message: 'Meta token is valid' });
    }

    // 2. Account active
    const profile = getProductProfile(launchConfig.productProfileId);
    if (!profile) {
      checks.push({
        check: 'account_active',
        status: 'fail',
        message: 'Product profile not found',
      });
    } else {
      checks.push({
        check: 'account_active',
        status: 'ok',
        message: `Ad account ${profile.adAccountId} is active`,
      });
    }

    // 3. Spending limit check (warn only -- we cannot fetch real-time limits without Meta API call)
    const dailyTotal = launchConfig.dailyBudget * launchConfig.selectedCreativeIds.length;
    if (dailyTotal > 10000) {
      checks.push({
        check: 'spending_limit',
        status: 'warn',
        message: `High total daily budget: $${dailyTotal.toFixed(2)} across ${launchConfig.selectedCreativeIds.length} creatives`,
        details: 'Ensure your ad account spending limit can accommodate this budget.',
      });
    } else {
      checks.push({
        check: 'spending_limit',
        status: 'ok',
        message: `Total daily budget: $${dailyTotal.toFixed(2)}`,
      });
    }

    // 4. Creatives uploaded
    const db = getDb();
    const notReadyItems = launchConfig.selectedCreativeIds.length > 0
      ? db.prepare(
          `SELECT id, creative_name, upload_status FROM creative_test_items
           WHERE id IN (${launchConfig.selectedCreativeIds.map(() => '?').join(',')})
           AND upload_status != 'ready'`
        ).all(...launchConfig.selectedCreativeIds) as Array<{ id: string; creative_name: string; upload_status: string }>
      : [];

    if (notReadyItems.length > 0) {
      checks.push({
        check: 'creatives_uploaded',
        status: 'fail',
        message: `${notReadyItems.length} creative(s) not ready for launch`,
        details: notReadyItems.map((i) => `${i.creative_name}: ${i.upload_status}`).join(', '),
      });
    } else {
      checks.push({
        check: 'creatives_uploaded',
        status: 'ok',
        message: `All ${launchConfig.selectedCreativeIds.length} creative(s) are uploaded and ready`,
      });
    }

    // 5. Landing page check
    const destinationUrl = launchConfig.destinationUrl || profile?.destinationUrl;
    if (destinationUrl) {
      try {
        const headRes = await fetch(destinationUrl, {
          method: 'HEAD',
          redirect: 'follow',
          signal: AbortSignal.timeout(8000),
        });
        if (headRes.ok) {
          checks.push({
            check: 'landing_page',
            status: 'ok',
            message: 'Landing page is reachable',
          });
        } else {
          checks.push({
            check: 'landing_page',
            status: 'warn',
            message: `Landing page returned HTTP ${headRes.status}`,
            details: destinationUrl,
          });
        }
      } catch (err) {
        checks.push({
          check: 'landing_page',
          status: 'warn',
          message: 'Landing page could not be reached',
          details: err instanceof Error ? err.message : destinationUrl,
        });
      }
    } else {
      checks.push({
        check: 'landing_page',
        status: 'fail',
        message: 'No destination URL configured',
        details: 'Set a destination URL in the product profile or launch config.',
      });
    }

    // 6. Duplicate creative check
    if (launchConfig.selectedCreativeIds.length > 0) {
      const selectedItems = db.prepare(
        `SELECT creative_name FROM creative_test_items
         WHERE id IN (${launchConfig.selectedCreativeIds.map(() => '?').join(',')})`
      ).all(...launchConfig.selectedCreativeIds) as CreativeTestItemRow[];

      const selectedNames = selectedItems.map((i) => i.creative_name);

      if (selectedNames.length > 0) {
        const existingDuplicates = db.prepare(
          `SELECT cti.creative_name, ct.id as test_id FROM creative_test_items cti
           JOIN creative_tests ct ON ct.id = cti.creative_test_id
           WHERE cti.creative_name IN (${selectedNames.map(() => '?').join(',')})
           AND ct.status IN ('active', 'launching')
           AND cti.id NOT IN (${launchConfig.selectedCreativeIds.map(() => '?').join(',')})`
        ).all(...selectedNames, ...launchConfig.selectedCreativeIds) as Array<{ creative_name: string; test_id: string }>;

        if (existingDuplicates.length > 0) {
          const dupeNames = [...new Set(existingDuplicates.map((d) => d.creative_name))];
          checks.push({
            check: 'duplicate_check',
            status: 'warn',
            message: `${dupeNames.length} creative(s) already in active tests`,
            details: dupeNames.join(', '),
          });
        } else {
          checks.push({ check: 'duplicate_check', status: 'ok', message: 'No duplicate creatives found' });
        }
      } else {
        checks.push({ check: 'duplicate_check', status: 'ok', message: 'No duplicate creatives found' });
      }
    } else {
      checks.push({
        check: 'duplicate_check',
        status: 'fail',
        message: 'No creatives selected for launch',
      });
    }

    // 7. Team collision -- same product with active tests
    if (profile) {
      const activeTests = db.prepare(
        `SELECT id, campaign_name FROM creative_tests
         WHERE product_profile_id = ? AND status = 'active'`
      ).all(profile.id) as CreativeTestRow[];

      if (activeTests.length > 0) {
        checks.push({
          check: 'team_collision',
          status: 'warn',
          message: `${activeTests.length} active test(s) already running for this product`,
          details: 'Another team member may be testing the same product.',
        });
      } else {
        checks.push({ check: 'team_collision', status: 'ok', message: 'No conflicting active tests for this product' });
      }
    }

    // 8. Weekend launch check
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 = Sunday, 6 = Saturday
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      checks.push({
        check: 'weekend_launch',
        status: 'warn',
        message: 'Launching on a weekend may affect performance data',
        details: 'Weekend traffic patterns differ from weekdays. Consider scheduling for Monday.',
      });
    } else {
      checks.push({ check: 'weekend_launch', status: 'ok', message: 'Launching on a weekday' });
    }

    // 9. Campaign naming collision
    const campaignName = launchConfig.campaignMode === 'new' ? launchConfig.newCampaignName : undefined;
    if (campaignName) {
      const existingCampaign = db.prepare(
        `SELECT id FROM creative_tests WHERE campaign_name = ? AND status != 'failed'`
      ).get(campaignName) as { id: string } | undefined;

      if (existingCampaign) {
        checks.push({
          check: 'naming_collision',
          status: 'warn',
          message: `Campaign name "${campaignName}" already exists`,
          details: 'Consider using a unique campaign name to avoid confusion.',
        });
      } else {
        checks.push({ check: 'naming_collision', status: 'ok', message: 'Campaign name is unique' });
      }
    } else if (launchConfig.campaignMode === 'existing') {
      checks.push({ check: 'naming_collision', status: 'ok', message: 'Using existing campaign' });
    } else {
      checks.push({
        check: 'naming_collision',
        status: 'fail',
        message: 'No campaign name provided for new campaign',
      });
    }

    // Build report
    const failures = checks.filter((c) => c.status === 'fail').length;
    const warnings = checks.filter((c) => c.status === 'warn').length;
    const canLaunch = failures === 0;

    const report: PreLaunchReport = { checks, canLaunch, warnings, failures };

    return NextResponse.json(report);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Health check failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
