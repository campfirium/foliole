import type { ButtonHTMLAttributes } from 'react';

import { appFocusControlClassName } from './InputFocus';

import { cn } from '@/shared/lib/utils';

type AppSwitchProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-checked' | 'onChange' | 'onClick' | 'role' | 'type'> & {
  checked: boolean;
  compact?: boolean;
  onCheckedChange: (checked: boolean) => void;
};

export function AppSwitch({ checked, className, compact = false, onCheckedChange, ...props }: AppSwitchProps) {
  return (
    <button
      {...props}
      aria-checked={checked}
      className={cn(
        'relative inline-flex shrink-0 cursor-pointer items-center rounded-full transition-colors',
        checked ? 'bg-foreground/55' : 'bg-foreground/14',
        compact ? 'h-5 w-9' : 'h-6 w-11',
        appFocusControlClassName,
        className
      )}
      onClick={() => onCheckedChange(!checked)}
      role="switch"
      type="button"
    >
      <span
        aria-hidden="true"
        className={cn(
          'absolute rounded-full bg-canvas shadow-marker transition-transform',
          compact ? 'size-4' : 'size-5',
          checked ? (compact ? 'translate-x-[18px]' : 'translate-x-[22px]') : 'translate-x-0.5'
        )}
      />
    </button>
  );
}
