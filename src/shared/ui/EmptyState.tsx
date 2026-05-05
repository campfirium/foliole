interface EmptyStateProps {
  title: string;
  description: string;
}

export function EmptyState({ title, description }: EmptyStateProps) {
  return (
    <div className="ui-empty" role="status">
      <p className="ui-empty-title">{title}</p>
      <p className="ui-empty-description">{description}</p>
    </div>
  );
}
