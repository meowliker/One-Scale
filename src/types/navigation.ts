import { type LucideIcon } from 'lucide-react';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

export interface SidebarConfig {
  brand: {
    name: string;
    domain: string;
  };
  topItems: NavItem[];
  sections: NavSection[];
  bottomItems: NavItem[];
}
