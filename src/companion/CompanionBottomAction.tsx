import type { ReactNode } from 'react';

import { companionFlexColumnGapHalfClassName } from './companionCssCompatibility';

export function CompanionBottomAction(props: {
  active?: boolean;
  disabled?: boolean;
  icon: ReactNode;
  label: string;
  onClick?: (() => void) | undefined;
  testId?: string | undefined;
  title?: string | undefined;
}) {
  return (
    <button
      aria-current={props.active ? 'page' : undefined}
      aria-label={props.label}
      className={`companion-bottom-action flex min-w-0 flex-1 flex-col items-center justify-center ${companionFlexColumnGapHalfClassName} transition-colors focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-companion-accent active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45 ${props.active ? 'text-companion-accent' : 'text-companion-text-secondary'}`}
      data-testid={props.testId}
      disabled={props.disabled}
      onClick={props.onClick}
      title={props.title}
      type="button"
    >
      <span className="inline-flex items-center justify-center rounded-full [height:1.5rem] [width:3rem]">
        {props.icon}
      </span>
      <span className="max-w-full truncate">{props.label}</span>
    </button>
  );
}
