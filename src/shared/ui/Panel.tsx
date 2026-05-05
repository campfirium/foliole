import { Box, Card, Heading } from '@radix-ui/themes';
import type { ComponentPropsWithoutRef, ElementType, ReactNode } from 'react';

import { cn } from '@/lib/utils';

type PanelElement = 'section' | 'aside' | 'div';

interface PanelProps<T extends PanelElement = 'section'> {
  as?: T;
  title: ReactNode;
  center?: ReactNode;
  actions?: ReactNode;
  onHeaderClick?: ComponentPropsWithoutRef<'header'>['onClick'];
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  bodyClassName?: string;
  ariaLabel?: string;
  scrollBody?: boolean;
}

export function AppPanel<T extends PanelElement = 'section'>({
  as,
  title,
  center,
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
      className={cn('min-h-0', className)}
      {...rest}
    >
      <Card className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-gradient-to-b from-bg-panel to-bg-subtle p-0 text-foreground shadow-[0_1px_0_rgba(255,255,255,0.8),0_18px_32px_-24px_rgba(88,63,33,0.45)]">
        <header
          className={cn(
            'flex min-h-[52px] items-center justify-start gap-3 border-b border-dashed border-border px-4 py-3',
            onHeaderClick && 'cursor-pointer transition-colors hover:bg-amber-100/40'
          )}
          onClick={onHeaderClick}
        >
          <div className="min-w-0 shrink-0">
            {useHeading ? (
              <Heading as="h3" className="m-0 text-xs font-bold uppercase tracking-[0.05em]" size="2">
                {title}
              </Heading>
            ) : (
              <div className="min-w-0">{title}</div>
            )}
          </div>
          <div className="min-w-0 flex-1 overflow-hidden">{center}</div>
          <div className="ml-auto shrink-0">{actions}</div>
        </header>
        <Box className={cn('min-h-0 flex-1', scrollBody && 'overflow-auto', bodyClassName)}>{children}</Box>
        {footer ? <footer className="border-t border-dashed border-border p-3">{footer}</footer> : null}
      </Card>
    </Component>
  );
}
