import type { ComponentPropsWithoutRef, ElementType, ReactNode } from 'react';

import { cn } from '@/shared/lib/utils';

type ToolbarElement = 'section' | 'div' | 'header';

interface ToolbarProps<T extends ToolbarElement = 'section'> {
  as?: T;
  ariaLabel?: string;
  className?: string;
  children: ReactNode;
}

export function AppToolbar<T extends ToolbarElement = 'section'>({
  as,
  ariaLabel,
  className,
  children,
  ...rest
}: ToolbarProps<T> & Omit<ComponentPropsWithoutRef<T>, keyof ToolbarProps>) {
  const Component = (as ?? 'section') as ElementType;

  return (
    <Component
      aria-label={ariaLabel}
      className={cn('flex flex-none items-center', className)}
      {...rest}
    >
      {children}
    </Component>
  );
}
