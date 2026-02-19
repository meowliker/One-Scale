interface SidebarSectionProps {
  title: string;
  isCollapsed: boolean;
}

export function SidebarSection({ title, isCollapsed }: SidebarSectionProps) {
  if (isCollapsed) return <div className="my-2 border-t border-border" />;

  return (
    <div className="px-4 pt-6 pb-2">
      <span className="text-xs font-semibold uppercase tracking-wider text-text-dimmed">
        {title}
      </span>
    </div>
  );
}
