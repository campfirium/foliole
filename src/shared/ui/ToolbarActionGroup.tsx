import type { ReactNode } from 'react';

import { cn } from '@/shared/lib/utils';

interface ToolbarActionGroupProps {
  ariaLabel?: string;
  children: ReactNode;
  className?: string;
  fullWidth?: boolean;
  orientation?: 'horizontal' | 'vertical';
}

export function ToolbarActionGroup({
  ariaLabel,
  children,
  className,
  fullWidth = false,
  orientation = 'horizontal'
}: ToolbarActionGroupProps) {
  return (
    <div
      aria-label={ariaLabel}
      className={cn(
        'inline-flex shrink-0 rounded-md border border-transparent',
        orientation === 'horizontal' ? 'items-center gap-1.5' : 'flex-col items-center gap-2',
        fullWidth && 'w-full justify-center',
        className
      )}
      role="group"
    >
      {children}
    </div>
  );
}
