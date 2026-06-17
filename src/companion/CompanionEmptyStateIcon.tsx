import type { LucideIcon } from 'lucide-react';

export function CompanionEmptyStateIcon(props: { Icon: LucideIcon }) {
  const Icon = props.Icon;
  return (
    <span
      aria-hidden="true"
      className="flex h-[84px] w-[84px] items-center justify-center rounded-[18px] bg-companion-accent-soft text-companion-accent"
      data-companion-empty-icon="true"
    >
      <Icon className="h-9 w-9" />
    </span>
  );
}
