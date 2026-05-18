import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

import { cn } from '@/shared/lib/utils';

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'color'> {
  icon: ReactNode;
  label: string;
}

export const AppIconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function AppIconButton(
  { icon, label, className, type = 'button', ...rest },
  ref
) {
  return (
    <button
      aria-label={label}
      className={cn(
        'inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-transparent bg-transparent text-foreground/70 transition-colors hover:bg-[var(--app-control-bg-hover-color)] hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-45',
        className
      )}
      ref={ref}
      type={type}
      {...rest}
    >
      {icon}
    </button>
  );
});
