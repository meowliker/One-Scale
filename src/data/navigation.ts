import {
  LayoutDashboard,
  Megaphone,
  Bot,
  Star,
  TrendingUp,
  Palette,
  Globe,
  Users,
  Calendar,
  Database,
  HelpCircle,
  Settings,
  DollarSign,
  Workflow,
  Crosshair,
  FlaskConical,
  BarChart3,
  FileText,
  Shield,
  Receipt,
  Rocket,
  Sparkles,
} from 'lucide-react';
import type { SidebarConfig } from '@/types/navigation';

export const sidebarConfig: SidebarConfig = {
  brand: {
    name: 'OneScale',
    domain: 'onescale.app',
  },
  topItems: [
    { label: 'Summary', href: '/dashboard/summary', icon: LayoutDashboard },
    { label: 'Store Overview', href: '/dashboard/store-overview', icon: BarChart3 },
    { label: 'Ads Manager', href: '/dashboard/ads-manager', icon: Megaphone },
    { label: 'P&L Tracking', href: '/dashboard/pnl', icon: DollarSign },
    { label: 'Expenses', href: '/dashboard/pnl/expenses', icon: Receipt },
    { label: 'Creative Testing', href: '/dashboard/creative-testing', icon: FlaskConical },
    { label: 'Creative Launch', href: '/dashboard/creative-launch', icon: Rocket },
    { label: 'Automation', href: '/dashboard/automation', icon: Workflow },
    { label: 'Tracking', href: '/dashboard/tracking', icon: Crosshair },
    { label: 'Attribution', href: '/dashboard/attribution', icon: BarChart3 },
    { label: '360° Meta Audit', href: '/dashboard/meta-audit', icon: Shield },
    { label: 'AI Assistant', href: '/dashboard/ai-assistant', icon: Bot },
    { label: 'Favorites', href: '/dashboard/favorites', icon: Star },
  ],
  sections: [
    {
      title: 'CORE WORKSPACES',
      items: [
        { label: 'Creative Hub', href: '/dashboard/creative-hub', icon: Sparkles },
        { label: 'Marketing Acquisition', href: '/dashboard/marketing-acquisition', icon: TrendingUp },
        { label: 'Creative Analysis', href: '/dashboard/creative-analysis', icon: Palette },
        { label: 'Website Conversion', href: '/dashboard/website-conversion', icon: Globe },
        { label: 'Customer Retention', href: '/dashboard/customer-retention', icon: Users },
        { label: 'Benchmarks', href: '/dashboard/benchmarks', icon: BarChart3 },
        { label: 'Audiences', href: '/dashboard/audiences', icon: Users },
      ],
    },
    {
      title: 'CUSTOM WORKSPACES',
      items: [
        { label: 'Day Parting', href: '/dashboard/day-parting', icon: Calendar },
      ],
    },
    {
      title: 'REPORTS & TOOLS',
      items: [
        { label: 'Reports', href: '/dashboard/reports', icon: FileText },
      ],
    },
  ],
  bottomItems: [
    { label: 'Data', href: '/dashboard/data', icon: Database },
    { label: 'Help', href: '/dashboard/help', icon: HelpCircle },
    { label: 'Settings', href: '/dashboard/settings/stores', icon: Settings },
  ],
};
