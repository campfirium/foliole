import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

import { appFocusControlClassName } from './InputFocus';

import { cn } from '@/shared/lib/utils';

type ButtonVariant = 'default' | 'ghost' | 'subtle' | 'emphasis' | 'danger' | 'list';
type ButtonSize = 'sm' | 'md';

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'color'> {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  active?: boolean;
}

function resolveVariantClass(variant: ButtonVariant) {
  if (variant === 'default') {
    return 'border border-[var(--app-control-border-color)] bg-transparent text-foreground hover:border-[var(--app-control-border-hover-color)] hover:bg-[var(--app-control-bg-hover-color)]';
  }
  if (variant === 'emphasis') {
    return 'border border-border-strong bg-transparent font-medium text-foreground hover:border-foreground/55 hover:bg-foreground/[0.04]';
  }
  if (variant === 'danger') {
    return 'border border-error/35 bg-transparent text-error hover:border-error/55 hover:bg-error/8 hover:text-error-foreground';
  }
  if (variant === 'subtle') {
    return 'text-foreground/70 hover:text-foreground';
  }
  if (variant === 'list') {
    return 'w-full justify-start px-3 text-left text-ui-base text-foreground/80 hover:bg-foreground/[0.03] hover:text-foreground';
  }
  return 'border border-transparent bg-transparent text-foreground/70 hover:bg-[var(--app-control-bg-hover-color)] hover:text-foreground';
}

function resolveSizeClass(size: ButtonSize) {
  return size === 'sm' ? 'min-h-8 px-3 text-ui-md' : 'min-h-9 px-3.5 text-ui-md';
}

export const AppButton = forwardRef<HTMLButtonElement, ButtonProps>(function AppButton(
  { children, variant = 'default', size = 'sm', className, active = false, type = 'button', ...rest },
  ref
) {
  const isList = variant === 'list';

  return (
    <button
      className={cn(
        'inline-flex shrink-0 items-center justify-center gap-2 rounded-md transition-colors disabled:pointer-events-none disabled:opacity-45',
        appFocusControlClassName,
        !isList && resolveSizeClass(size),
        resolveVariantClass(variant),
        active && isList && 'border border-border-strong bg-foreground/[0.05] text-foreground',
        className
      )}
      data-active={active}
      ref={ref}
      type={type}
      {...rest}
    >
      {children}
    </button>
  );
});
