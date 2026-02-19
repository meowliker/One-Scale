export interface Audience {
  id: string;
  name: string;
  type: 'Saved' | 'Lookalike' | 'Custom';
  size: number;
  status: 'Active' | 'Inactive';
  source: string;
  createdAt: string;
  lastUsed: string;
}

export const mockAudiences: Audience[] = [
  {
    id: 'aud-1',
    name: 'Website Visitors 180d',
    type: 'Saved',
    size: 245000,
    status: 'Active',
    source: 'Pixel - All Pages',
    createdAt: '2025-01-15',
    lastUsed: '2025-03-10',
  },
  {
    id: 'aud-2',
    name: 'Purchase Lookalike 1%',
    type: 'Lookalike',
    size: 1850000,
    status: 'Active',
    source: 'Purchasers - Last 90d',
    createdAt: '2025-02-01',
    lastUsed: '2025-03-09',
  },
  {
    id: 'aud-3',
    name: 'Cart Abandoners 30d',
    type: 'Custom',
    size: 42000,
    status: 'Active',
    source: 'Add to Cart Event',
    createdAt: '2025-02-10',
    lastUsed: '2025-03-08',
  },
  {
    id: 'aud-4',
    name: 'Email Subscribers',
    type: 'Saved',
    size: 85000,
    status: 'Active',
    source: 'Customer List Upload',
    createdAt: '2025-01-20',
    lastUsed: '2025-03-07',
  },
  {
    id: 'aud-5',
    name: 'ATC Lookalike 2%',
    type: 'Lookalike',
    size: 3200000,
    status: 'Active',
    source: 'Add to Cart - 180d',
    createdAt: '2025-02-15',
    lastUsed: '2025-03-06',
  },
  {
    id: 'aud-6',
    name: 'High-Value Customers',
    type: 'Custom',
    size: 18500,
    status: 'Active',
    source: 'AOV > $100 Purchasers',
    createdAt: '2025-01-25',
    lastUsed: '2025-03-05',
  },
  {
    id: 'aud-7',
    name: 'Product Page Viewers',
    type: 'Saved',
    size: 156000,
    status: 'Inactive',
    source: 'Pixel - Product Pages',
    createdAt: '2025-02-05',
    lastUsed: '2025-02-28',
  },
  {
    id: 'aud-8',
    name: 'Repeat Purchasers',
    type: 'Custom',
    size: 12800,
    status: 'Active',
    source: '2+ Purchases Last 365d',
    createdAt: '2025-01-10',
    lastUsed: '2025-03-04',
  },
  {
    id: 'aud-9',
    name: 'Visitor Lookalike 1%',
    type: 'Lookalike',
    size: 2100000,
    status: 'Inactive',
    source: 'Website Visitors 180d',
    createdAt: '2025-02-20',
    lastUsed: '2025-02-25',
  },
  {
    id: 'aud-10',
    name: 'Engaged Instagram Users',
    type: 'Saved',
    size: 320000,
    status: 'Active',
    source: 'IG Engagers 90d',
    createdAt: '2025-02-25',
    lastUsed: '2025-03-10',
  },
];
