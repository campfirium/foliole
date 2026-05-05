interface EmptyStateProps {
  title: string;
  description: string;
}

export function AppEmptyState({ title, description }: EmptyStateProps) {
  return (
    <div className="flex min-h-[120px] flex-col items-center justify-center gap-2 text-center text-sm text-foreground/60" role="status">
      <p className="m-0 text-sm font-semibold text-foreground">{title}</p>
      <p className="m-0 text-[13px]">{description}</p>
    </div>
  );
}
