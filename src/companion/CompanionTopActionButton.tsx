import type { LucideIcon } from 'lucide-react';

export function CompanionTopActionButton(props: {
  disabled?: boolean;
  icon: LucideIcon;
  label: string;
  onClick(): void;
  pressed?: boolean;
  testId?: string;
}) {
  const Icon = props.icon;
  return (
    <button
      aria-label={props.label}
      aria-pressed={props.pressed}
      className="inline-flex h-10 w-10 items-center justify-center rounded-md text-companion-text-secondary transition hover:bg-bg-subtle/60 hover:text-foreground aria-pressed:text-foreground disabled:opacity-50"
      data-testid={props.testId}
      disabled={props.disabled}
      onClick={props.onClick}
      type="button"
    >
      <Icon className="h-5 w-5" />
    </button>
  );
}
