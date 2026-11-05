import { useId } from 'react';
import type { ReactNode } from 'react';

import { cn } from '@/shared/lib/utils';

export function CompanionContentTabs<T extends string>(props: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange(value: T): void;
  children: ReactNode;
}) {
  const id = useId();
  return <>
    <div aria-label={props.label} className="flex border-b border-companion-divider" role="tablist">
      {props.options.map((option, index) => <button
        aria-controls={`${id}-panel`} aria-selected={props.value === option.value}
        className={cn('min-h-11 min-w-0 flex-1 px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring',
          props.value === option.value ? 'font-medium text-companion-accent' : 'text-companion-text-secondary')}
        id={`${id}-${option.value}`} key={option.value}
        onClick={() => props.onChange(option.value)}
        onKeyDown={(event) => {
          const direction = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? props.options.length - 1
            : (index + direction + props.options.length) % props.options.length;
          if (!direction && event.key !== 'Home' && event.key !== 'End') return;
          event.preventDefault();
          props.onChange(props.options[next]!.value);
          event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
        }}
        role="tab" tabIndex={props.value === option.value ? 0 : -1} type="button"
      >{option.label}</button>)}
    </div>
    <div aria-labelledby={`${id}-${props.value}`} id={`${id}-panel`} role="tabpanel" tabIndex={0}>
      {props.children}
    </div>
  </>;
}
