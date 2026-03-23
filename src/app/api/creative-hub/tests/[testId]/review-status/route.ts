import { NextRequest, NextResponse } from 'next/server';
import { getCreativeTest, updateCreativeTestItem } from '@/app/api/lib/creative-hub-db';
import { getMetaToken } from '@/app/api/lib/tokens';
import { fetchFromMeta } from '@/app/api/lib/meta-client';

interface MetaAdReview {
  effective_status?: string;
  configured_status?: string;
  review_feedback?: { global?: Record<string, string> };
}

interface MetaAdsetLearning {
  learning_stage?: string;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ testId: string }> }
) {
  const { testId } = await params;
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId');

  if (!storeId) {
    return NextResponse.json({ error: 'storeId is required' }, { status: 400 });
  }

  const test = getCreativeTest(testId);
  if (!test) {
    return NextResponse.json({ error: 'Test not found' }, { status: 404 });
  }
  if (test.storeId !== storeId) {
    return NextResponse.json({ error: 'Test does not belong to this store' }, { status: 403 });
  }

  const token = await getMetaToken(storeId);
  if (!token) {
    return NextResponse.json({ error: 'Not authenticated with Meta' }, { status: 401 });
  }

  try {
    const itemsWithAds = test.items.filter((item) => item.metaAdId);

    const results = await Promise.all(
      itemsWithAds.map(async (item) => {
        try {
          // Fetch ad review status
          const adData = await fetchFromMeta<MetaAdReview>(
            token.accessToken,
            `/${item.metaAdId}`,
            { fields: 'effective_status,review_feedback,configured_status' },
            15_000,
            1
          );

          // Map effective_status to our ReviewStatus type
          let reviewStatus: string | undefined;
          const effectiveStatus = adData.effective_status?.toUpperCase() ?? '';
          if (effectiveStatus === 'ACTIVE' || effectiveStatus === 'CAMPAIGN_PAUSED' || effectiveStatus === 'ADSET_PAUSED') {
            reviewStatus = 'ACTIVE';
          } else if (effectiveStatus === 'DISAPPROVED') {
            reviewStatus = 'DISAPPROVED';
          } else if (effectiveStatus === 'PENDING_REVIEW' || effectiveStatus === 'IN_PROCESS') {
            reviewStatus = 'IN_REVIEW';
          } else if (effectiveStatus === 'WITH_ISSUES') {
            reviewStatus = 'WITH_ISSUES';
          } else {
            reviewStatus = effectiveStatus || undefined;
          }

          // Flatten review feedback
          const feedbackObj = adData.review_feedback?.global;
          const reviewFeedback = feedbackObj
            ? Object.entries(feedbackObj).map(([k, v]) => `${k}: ${v}`).join('; ')
            : undefined;

          // Fetch learning phase from adset
          let learningPhase: string | undefined;
          if (item.metaAdsetId) {
            try {
              const adsetData = await fetchFromMeta<MetaAdsetLearning>(
                token.accessToken,
                `/${item.metaAdsetId}`,
                { fields: 'learning_stage' },
                15_000,
                1
              );
              learningPhase = adsetData.learning_stage ?? undefined;
            } catch {
              // non-critical, skip
            }
          }

          // Update DB
          updateCreativeTestItem(item.id, {
            reviewStatus,
            reviewFeedback,
            learningPhase,
          });

          return {
            id: item.id,
            reviewStatus,
            reviewFeedback,
            learningPhase,
          };
        } catch {
          return {
            id: item.id,
            reviewStatus: undefined,
            reviewFeedback: undefined,
            learningPhase: undefined,
          };
        }
      })
    );

    return NextResponse.json({ items: results });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch review status';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
