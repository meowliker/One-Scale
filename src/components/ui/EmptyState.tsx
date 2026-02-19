export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      {icon && (
        <div className="mb-4 text-text-dimmed">{icon}</div>
      )}
      <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
      {description && (
        <p className="mt-1 text-sm text-text-muted">{description}</p>
      )}
      {action && (
        <button
          onClick={action.onClick}
          className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark transition-colors"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
