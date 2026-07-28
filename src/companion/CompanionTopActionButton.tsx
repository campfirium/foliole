import type { LucideIcon } from 'lucide-react';

export function CompanionTopActionButton(props: {
  icon: LucideIcon;
  label: string;
  onClick(): void;
  testId?: string;
}) {
  const Icon = props.icon;
  return (
    <button
      aria-label={props.label}
      className="inline-flex h-10 w-10 items-center justify-center rounded-md text-companion-text-secondary transition hover:bg-bg-subtle/60 hover:text-foreground"
      data-testid={props.testId}
      onClick={props.onClick}
      type="button"
    >
      <Icon className="h-5 w-5" />
    </button>
  );
}
