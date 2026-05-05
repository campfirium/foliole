import type { ButtonHTMLAttributes, ReactNode } from 'react';

import { cn } from '@/shared/lib/utils';

type ButtonVariant = 'primary' | 'ghost' | 'subtle' | 'list';
type ButtonSize = 'sm' | 'md';

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'color'> {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  active?: boolean;
}

function resolveVariantClass(variant: ButtonVariant) {
  if (variant === 'primary') {
    return 'border border-border bg-transparent text-foreground hover:bg-foreground/[0.04]';
  }
  if (variant === 'subtle') {
    return 'text-foreground/70 hover:text-foreground';
  }
  if (variant === 'list') {
    return 'w-full justify-start px-3 py-2 text-left text-[13px] text-foreground/80 hover:bg-foreground/[0.03] hover:text-foreground';
  }
  return 'border border-transparent bg-transparent text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground';
}

function resolveSizeClass(size: ButtonSize) {
  return size === 'sm' ? 'min-h-8 px-3 text-sm' : 'min-h-9 px-3.5 text-sm';
}

export function AppButton({
  children,
  variant = 'ghost',
  size = 'sm',
  className,
  active = false,
  type = 'button',
  ...rest
}: ButtonProps) {
  const isList = variant === 'list';

  return (
    <button
      className={cn(
        'inline-flex shrink-0 items-center justify-center gap-2 rounded-md transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
        !isList && resolveSizeClass(size),
        resolveVariantClass(variant),
        active && isList && 'border border-border-strong bg-foreground/[0.05] text-foreground',
        className
      )}
      data-active={active}
      type={type}
      {...rest}
    >
      {children}
    </button>
  );
}
