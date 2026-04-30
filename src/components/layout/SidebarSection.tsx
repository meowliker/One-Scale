interface SidebarSectionProps {
  title: string;
  isCollapsed: boolean;
}

export function SidebarSection({ title, isCollapsed }: SidebarSectionProps) {
  if (isCollapsed) return <div className="my-2 border-t border-border" />;

  return (
    <div className="px-4 pt-5 pb-2">
      <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-dimmed">
        {title}
      </span>
    </div>
  );
}
