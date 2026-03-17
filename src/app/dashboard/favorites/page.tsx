'use client';

import { Star } from 'lucide-react';

export default function FavoritesPage() {
  return (
    <div className="flex flex-col items-center justify-center h-96 gap-4">
      <Star className="w-12 h-12 text-text-muted" />
      <p className="text-lg font-medium text-text-secondary">Favorites</p>
      <p className="text-sm text-text-muted">Coming soon</p>
    </div>
  );
}
