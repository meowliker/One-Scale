import { NextRequest, NextResponse } from 'next/server';
import {
  getProductProfile,
  upsertProductProfile,
  deleteProductProfile,
} from '@/app/api/lib/creative-hub-db';

// PATCH /api/creative-hub/product-profiles/[id]
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const existing = getProductProfile(id);

    if (!existing) {
      return NextResponse.json({ error: 'Product profile not found' }, { status: 404 });
    }

    const updates = await request.json();

    // Merge existing profile with updates, preserving required fields
    const merged = {
      ...existing,
      ...updates,
      id: existing.id,
      storeId: existing.storeId,
    };

    upsertProductProfile(merged);

    const updated = getProductProfile(id);
    return NextResponse.json({ profile: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update product profile';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE /api/creative-hub/product-profiles/[id]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    deleteProductProfile(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete product profile';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
