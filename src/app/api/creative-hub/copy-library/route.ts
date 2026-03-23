import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import {
  getCopyLibrary,
  saveCopyToLibrary,
  deleteCopyFromLibrary,
} from '@/app/api/lib/creative-hub-db';

// GET /api/creative-hub/copy-library?productId=X
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const productId = searchParams.get('productId');

  if (!productId) {
    return NextResponse.json({ error: 'productId is required' }, { status: 400 });
  }

  try {
    const copies = await getCopyLibrary(productId);
    return NextResponse.json({ copies });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch copy library';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST /api/creative-hub/copy-library
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.productProfileId || !body.primaryText) {
      return NextResponse.json(
        { error: 'productProfileId and primaryText are required' },
        { status: 400 }
      );
    }

    const id = randomUUID();
    const copy = {
      ...body,
      id,
      roas: body.roas ?? 0,
      totalSpend: body.totalSpend ?? 0,
      totalRevenue: body.totalRevenue ?? 0,
      totalPurchases: body.totalPurchases ?? 0,
      isAiGenerated: body.isAiGenerated ?? false,
    };

    await saveCopyToLibrary(copy);

    return NextResponse.json(
      { ...copy, createdAt: new Date().toISOString() },
      { status: 201 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save copy';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE /api/creative-hub/copy-library?id=X
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  try {
    await deleteCopyFromLibrary(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete copy';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
