import { NextRequest, NextResponse } from 'next/server';
import {
  getStore,
  getProductCosts,
  upsertProductCost,
  deleteProductCost,
  getShippingSettings,
  upsertShippingSettings,
  getPaymentFees,
  upsertPaymentFee,
  deletePaymentFee,
  getCustomExpenses,
  addCustomExpense,
  updateCustomExpense,
  deleteCustomExpense,
  getHandlingFees,
  upsertHandlingFees,
  getPnlStoreSettings,
  upsertPnlStoreSettings,
} from '@/app/api/lib/db';
import {
  isSupabasePersistenceEnabled,
  getPersistentStore,
  getPersistentProductCosts,
  upsertPersistentProductCost,
  deletePersistentProductCost,
  getPersistentShippingSettings,
  upsertPersistentShippingSettings,
  getPersistentPaymentFees,
  upsertPersistentPaymentFee,
  deletePersistentPaymentFee,
  getPersistentCustomExpenses,
  addPersistentCustomExpense,
  updatePersistentCustomExpense,
  deletePersistentCustomExpense,
  getPersistentHandlingFees,
  upsertPersistentHandlingFees,
  getPersistentPnlStoreSettings,
  upsertPersistentPnlStoreSettings,
} from '@/app/api/lib/supabase-persistence';

// ---------- GET /api/settings/pnl?storeId=xxx ----------
// Returns all P&L cost settings for a store.
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get('storeId');

    if (!storeId) {
      return NextResponse.json({ error: 'storeId is required' }, { status: 400 });
    }

    const sb = isSupabasePersistenceEnabled();

    const store = sb ? await getPersistentStore(storeId) : getStore(storeId);
    if (!store) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 });
    }

    const rawProductCosts = sb ? await getPersistentProductCosts(storeId) : getProductCosts(storeId);
    const productCosts = rawProductCosts.map((pc) => ({
      id: pc.id,
      productId: pc.product_id,
      productName: pc.product_name,
      sku: pc.sku,
      costPerUnit: pc.cost_per_unit,
      costType: pc.cost_type,
      effectiveDate: pc.effective_date,
      createdAt: pc.created_at,
    }));

    const shippingRaw = sb ? await getPersistentShippingSettings(storeId) : getShippingSettings(storeId);
    const shipping = shippingRaw
      ? {
          method: shippingRaw.method,
          flatRate: shippingRaw.flat_rate,
          percentage: shippingRaw.percentage,
          perItemRate: shippingRaw.per_item_rate,
          updatedAt: shippingRaw.updated_at,
        }
      : null;

    const rawPaymentFees = sb ? await getPersistentPaymentFees(storeId) : getPaymentFees(storeId);
    const paymentFees = rawPaymentFees.map((pf) => ({
      id: pf.id,
      gatewayName: pf.gateway_name,
      feePercentage: pf.fee_percentage,
      feeFixed: pf.fee_fixed,
      isActive: pf.is_active === 1 || pf.is_active === true,
      createdAt: pf.created_at,
    }));

    const rawCustomExpenses = sb ? await getPersistentCustomExpenses(storeId) : getCustomExpenses(storeId);
    const customExpenses = rawCustomExpenses.map((ce) => ({
      id: ce.id,
      name: ce.name,
      category: ce.category,
      amount: ce.amount,
      frequency: ce.frequency,
      distribution: ce.distribution,
      startDate: ce.start_date,
      endDate: ce.end_date,
      isActive: ce.is_active === 1 || ce.is_active === true,
      createdAt: ce.created_at,
    }));

    const handlingRaw = sb ? await getPersistentHandlingFees(storeId) : getHandlingFees(storeId);
    const handling = handlingRaw
      ? {
          feeType: handlingRaw.fee_type,
          amount: handlingRaw.amount,
          updatedAt: handlingRaw.updated_at,
        }
      : null;

    const storeSettingsRaw = sb ? await getPersistentPnlStoreSettings(storeId) : getPnlStoreSettings(storeId);
    const productType = storeSettingsRaw?.product_type || 'physical';

    return NextResponse.json({
      storeId,
      productType,
      productCosts,
      shipping,
      paymentFees,
      customExpenses,
      handling,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ---------- PUT /api/settings/pnl?storeId=xxx ----------
// Updates a specific section of P&L cost settings.
// Body: { section: 'shipping' | 'handling' | 'payment_fees' | 'product_costs' | 'custom_expenses', data: ... }
export async function PUT(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get('storeId');

    if (!storeId) {
      return NextResponse.json({ error: 'storeId is required' }, { status: 400 });
    }

    const sb = isSupabasePersistenceEnabled();

    const store = sb ? await getPersistentStore(storeId) : getStore(storeId);
    if (!store) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 });
    }

    const body = await request.json();
    const { section, data } = body as { section: string; data: Record<string, unknown> };

    if (!section || !data) {
      return NextResponse.json(
        { error: 'section and data are required' },
        { status: 400 }
      );
    }

    switch (section) {
      case 'product_type':
        if (sb) {
          await upsertPersistentPnlStoreSettings(storeId, {
            productType: data.productType as 'physical' | 'digital',
          });
        } else {
          upsertPnlStoreSettings(storeId, {
            productType: data.productType as 'physical' | 'digital',
          });
        }
        break;

      case 'shipping':
        if (sb) {
          await upsertPersistentShippingSettings({
            storeId,
            method: data.method as 'flat_rate' | 'percentage' | 'equal_charged' | 'per_item',
            flatRate: data.flatRate as number | undefined,
            percentage: data.percentage as number | undefined,
            perItemRate: data.perItemRate as number | undefined,
          });
        } else {
          upsertShippingSettings(storeId, {
            method: data.method as 'flat_rate' | 'percentage' | 'equal_charged' | 'per_item',
            flatRate: data.flatRate as number | undefined,
            percentage: data.percentage as number | undefined,
            perItemRate: data.perItemRate as number | undefined,
          });
        }
        break;

      case 'handling':
        if (sb) {
          await upsertPersistentHandlingFees({
            storeId,
            feeType: data.feeType as 'per_order' | 'per_item' | 'percentage',
            amount: data.amount as number,
          });
        } else {
          upsertHandlingFees(storeId, {
            feeType: data.feeType as 'per_order' | 'per_item' | 'percentage',
            amount: data.amount as number,
          });
        }
        break;

      case 'payment_fees':
        if (sb) {
          await upsertPersistentPaymentFee({
            storeId,
            gatewayName: data.gatewayName as string,
            feePercentage: data.feePercentage as number,
            feeFixed: data.feeFixed as number,
            isActive: data.isActive as boolean | undefined,
          });
        } else {
          upsertPaymentFee(storeId, {
            gatewayName: data.gatewayName as string,
            feePercentage: data.feePercentage as number,
            feeFixed: data.feeFixed as number,
            isActive: data.isActive as boolean | undefined,
          });
        }
        break;

      case 'product_costs':
        if (sb) {
          await upsertPersistentProductCost({
            storeId,
            productId: data.productId as string,
            productName: data.productName as string,
            sku: data.sku as string | undefined,
            costPerUnit: data.costPerUnit as number,
            costType: data.costType as 'fixed' | 'percentage' | undefined,
            effectiveDate: data.effectiveDate as string | undefined,
          });
        } else {
          upsertProductCost({
            storeId,
            productId: data.productId as string,
            productName: data.productName as string,
            sku: data.sku as string | undefined,
            costPerUnit: data.costPerUnit as number,
            costType: data.costType as 'fixed' | 'percentage' | undefined,
            effectiveDate: data.effectiveDate as string | undefined,
          });
        }
        break;

      case 'custom_expenses': {
        const expenseId = data.id as number | undefined;
        if (!expenseId) {
          return NextResponse.json(
            { error: 'data.id is required for updating custom expenses' },
            { status: 400 }
          );
        }
        if (sb) {
          await updatePersistentCustomExpense(expenseId, {
            name: data.name as string | undefined,
            category: data.category as 'fixed' | 'variable' | undefined,
            amount: data.amount as number | undefined,
            frequency: data.frequency as 'daily' | 'weekly' | 'monthly' | 'yearly' | 'one_time' | undefined,
            distribution: data.distribution as 'daily' | 'hourly' | 'smart' | undefined,
            startDate: data.startDate as string | undefined,
            endDate: data.endDate as string | undefined,
            isActive: data.isActive as boolean | undefined,
          });
        } else {
          updateCustomExpense(expenseId, {
            name: data.name as string | undefined,
            category: data.category as 'fixed' | 'variable' | undefined,
            amount: data.amount as number | undefined,
            frequency: data.frequency as 'daily' | 'weekly' | 'monthly' | 'yearly' | 'one_time' | undefined,
            distribution: data.distribution as 'daily' | 'hourly' | 'smart' | undefined,
            startDate: data.startDate as string | undefined,
            endDate: data.endDate as string | undefined,
            isActive: data.isActive as boolean | undefined,
          });
        }
        break;
      }

      default:
        return NextResponse.json(
          { error: `Unknown section: ${section}. Expected one of: shipping, handling, payment_fees, product_costs, custom_expenses` },
          { status: 400 }
        );
    }

    return NextResponse.json({ success: true, section });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ---------- POST /api/settings/pnl?storeId=xxx ----------
// Adds a new item (product cost, payment fee, or custom expense).
// Body: { section: 'product_costs' | 'payment_fees' | 'custom_expenses', data: ... }
export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get('storeId');

    if (!storeId) {
      return NextResponse.json({ error: 'storeId is required' }, { status: 400 });
    }

    const sb = isSupabasePersistenceEnabled();

    const store = sb ? await getPersistentStore(storeId) : getStore(storeId);
    if (!store) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 });
    }

    const body = await request.json();
    const { section, data } = body as { section: string; data: Record<string, unknown> };

    if (!section || !data) {
      return NextResponse.json(
        { error: 'section and data are required' },
        { status: 400 }
      );
    }

    switch (section) {
      case 'product_costs':
        if (!data.productId || !data.productName) {
          return NextResponse.json(
            { error: 'productId and productName are required' },
            { status: 400 }
          );
        }
        if (sb) {
          await upsertPersistentProductCost({
            storeId,
            productId: data.productId as string,
            productName: data.productName as string,
            sku: data.sku as string | undefined,
            costPerUnit: (data.costPerUnit as number) ?? 0,
            costType: data.costType as 'fixed' | 'percentage' | undefined,
            effectiveDate: data.effectiveDate as string | undefined,
          });
        } else {
          upsertProductCost({
            storeId,
            productId: data.productId as string,
            productName: data.productName as string,
            sku: data.sku as string | undefined,
            costPerUnit: (data.costPerUnit as number) ?? 0,
            costType: data.costType as 'fixed' | 'percentage' | undefined,
            effectiveDate: data.effectiveDate as string | undefined,
          });
        }
        break;

      case 'payment_fees':
        if (!data.gatewayName) {
          return NextResponse.json(
            { error: 'gatewayName is required' },
            { status: 400 }
          );
        }
        if (sb) {
          await upsertPersistentPaymentFee({
            storeId,
            gatewayName: data.gatewayName as string,
            feePercentage: (data.feePercentage as number) ?? 0,
            feeFixed: (data.feeFixed as number) ?? 0,
            isActive: data.isActive as boolean | undefined,
          });
        } else {
          upsertPaymentFee(storeId, {
            gatewayName: data.gatewayName as string,
            feePercentage: (data.feePercentage as number) ?? 0,
            feeFixed: (data.feeFixed as number) ?? 0,
            isActive: data.isActive as boolean | undefined,
          });
        }
        break;

      case 'custom_expenses':
        if (!data.name) {
          return NextResponse.json(
            { error: 'name is required' },
            { status: 400 }
          );
        }
        if (sb) {
          await addPersistentCustomExpense({
            storeId,
            name: data.name as string,
            category: data.category as 'fixed' | 'variable' | undefined,
            amount: (data.amount as number) ?? 0,
            frequency: data.frequency as 'daily' | 'weekly' | 'monthly' | 'yearly' | 'one_time' | undefined,
            distribution: data.distribution as 'daily' | 'hourly' | 'smart' | undefined,
            startDate: data.startDate as string | undefined,
            endDate: data.endDate as string | undefined,
          });
        } else {
          addCustomExpense(storeId, {
            name: data.name as string,
            category: data.category as 'fixed' | 'variable' | undefined,
            amount: (data.amount as number) ?? 0,
            frequency: data.frequency as 'daily' | 'weekly' | 'monthly' | 'yearly' | 'one_time' | undefined,
            distribution: data.distribution as 'daily' | 'hourly' | 'smart' | undefined,
            startDate: data.startDate as string | undefined,
            endDate: data.endDate as string | undefined,
            isActive: data.isActive as boolean | undefined,
          });
        }
        break;

      default:
        return NextResponse.json(
          { error: `Unknown section: ${section}. Expected one of: product_costs, payment_fees, custom_expenses` },
          { status: 400 }
        );
    }

    return NextResponse.json({ success: true, section });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    if (msg.includes('UNIQUE constraint failed') || msg.includes('duplicate key')) {
      return NextResponse.json(
        { error: 'An item with these details already exists' },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ---------- DELETE /api/settings/pnl?storeId=xxx&section=xxx&id=xxx ----------
// Deletes an item from a P&L cost settings section.
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get('storeId');
    const section = searchParams.get('section');
    const id = searchParams.get('id');

    if (!storeId) {
      return NextResponse.json({ error: 'storeId is required' }, { status: 400 });
    }
    if (!section) {
      return NextResponse.json({ error: 'section is required' }, { status: 400 });
    }
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const sb = isSupabasePersistenceEnabled();

    const store = sb ? await getPersistentStore(storeId) : getStore(storeId);
    if (!store) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 });
    }

    switch (section) {
      case 'product_costs':
        if (sb) {
          // For Supabase: find the row by storeId + productId, then delete by numeric ID
          const costs = await getPersistentProductCosts(storeId);
          const cost = costs.find((c) => c.product_id === id);
          if (cost) await deletePersistentProductCost(cost.id);
        } else {
          // id = productId for product costs
          deleteProductCost(storeId, id);
        }
        break;

      case 'payment_fees':
        if (sb) {
          // For Supabase: find the row by storeId + gatewayName, then delete by numeric ID
          const fees = await getPersistentPaymentFees(storeId);
          const fee = fees.find((f) => f.gateway_name === id);
          if (fee) await deletePersistentPaymentFee(fee.id);
        } else {
          // id = gatewayName for payment fees
          deletePaymentFee(storeId, id);
        }
        break;

      case 'custom_expenses':
        // id = numeric expense id
        if (sb) {
          await deletePersistentCustomExpense(parseInt(id, 10));
        } else {
          deleteCustomExpense(parseInt(id, 10));
        }
        break;

      default:
        return NextResponse.json(
          { error: `Unknown section: ${section}. Expected one of: product_costs, payment_fees, custom_expenses` },
          { status: 400 }
        );
    }

    return NextResponse.json({ success: true, section });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
