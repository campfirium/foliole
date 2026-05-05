import type { ComponentPropsWithoutRef, ElementType, ReactNode } from 'react';

import { CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type PanelElement = 'section' | 'aside' | 'div';

interface PanelProps<T extends PanelElement = 'section'> {
  as?: T;
  title: ReactNode;
  actions?: ReactNode;
  onHeaderClick?: ComponentPropsWithoutRef<'header'>['onClick'];
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  bodyClassName?: string;
  ariaLabel?: string;
  scrollBody?: boolean;
}

export function Panel<T extends PanelElement = 'section'>({
  as,
  title,
  actions,
  onHeaderClick,
  children,
  footer,
  className,
  bodyClassName,
  ariaLabel,
  scrollBody = false,
  ...rest
}: PanelProps<T> & Omit<ComponentPropsWithoutRef<T>, keyof PanelProps>) {
  const Component = (as ?? 'section') as ElementType;
  const useHeading = typeof title === 'string';

  return (
    <Component
      aria-label={ariaLabel}
      className={cn(
        'flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-gradient-to-b from-bg-panel to-bg-subtle text-foreground shadow-[0_1px_0_rgba(255,255,255,0.8),0_18px_32px_-24px_rgba(88,63,33,0.45)]',
        className
      )}
      {...rest}
    >
      <CardHeader className={cn(onHeaderClick && 'cursor-pointer transition-colors hover:bg-amber-100/40')} onClick={onHeaderClick}>
        {useHeading ? <CardTitle className="flex-1">{title}</CardTitle> : <div className="min-w-0 flex-1">{title}</div>}
        {actions}
      </CardHeader>
      <CardContent className={cn('min-h-0 flex-1', scrollBody && 'overflow-auto', bodyClassName)}>{children}</CardContent>
      {footer ? <CardFooter>{footer}</CardFooter> : null}
    </Component>
  );
}
