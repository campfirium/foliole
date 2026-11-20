import { Check, type LucideIcon } from 'lucide-react';
import type { ComponentProps } from 'react';

import { CompanionBottomSheet } from './CompanionBottomSheet';

export const companionMenuRowClass = 'flex w-full items-center justify-between gap-4 border-b border-companion-divider px-1 py-4 text-left text-base font-medium text-foreground transition-colors active:bg-companion-subtle/80 disabled:active:bg-transparent [overflow-wrap:anywhere]';

export function CompanionMenuSheet({ children, ...props }: ComponentProps<typeof CompanionBottomSheet>) {
  return <CompanionBottomSheet {...props} hideCloseButton>
    <div className="border-t border-companion-divider">{children}</div>
  </CompanionBottomSheet>;
}

export function CompanionMenuRow(props: {
  active?: boolean;
  destructive?: boolean;
  disabled?: boolean;
  label: string;
  onSelect?: () => void;
  status?: string;
  trailingIcon?: LucideIcon;
}) {
  const TrailingIcon = props.trailingIcon;
  return (
    <button
      aria-disabled={props.disabled ? 'true' : undefined}
      className={companionMenuRowClass}
      disabled={props.disabled}
      onClick={props.onSelect}
      type="button"
    >
      <span className={props.destructive ? 'text-error' : undefined}>{props.label}</span>
      <span className="inline-flex items-center gap-2 text-sm font-normal text-companion-text-tertiary">
        {props.status}
        {TrailingIcon ? <TrailingIcon className="h-4 w-4" /> : null}
        {props.active ? <Check className="h-4 w-4 text-foreground" /> : null}
      </span>
    </button>
  );
}
