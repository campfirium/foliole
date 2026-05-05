import type { ComponentPropsWithoutRef, ElementType, ReactNode } from 'react';

import { cn } from '@/shared/lib/utils';

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
  surfaceClassName?: string;
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
  surfaceClassName,
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
      <div className={cn('flex h-full min-h-0 flex-col overflow-hidden bg-transparent p-0 text-foreground', surfaceClassName)}>
        <header
          className={cn(
            'flex min-h-[48px] items-center justify-start gap-3 px-4 py-2',
            onHeaderClick && 'cursor-pointer transition-colors hover:bg-foreground/[0.03]'
          )}
          onClick={onHeaderClick}
        >
          <div className="min-w-0 shrink-0">
            {useHeading ? (
              <h3 className="m-0 text-sm font-semibold uppercase tracking-[0.04em]">
                {title}
              </h3>
            ) : (
              <div className="min-w-0">{title}</div>
            )}
          </div>
          <div className="min-w-0 flex-1 overflow-hidden">{center}</div>
          <div className="ml-auto shrink-0">{actions}</div>
        </header>
        <div className={cn('min-h-0 flex-1', scrollBody && 'app-scrollbar overflow-auto', bodyClassName)}>{children}</div>
        {footer ? <footer className="p-3">{footer}</footer> : null}
      </div>
    </Component>
  );
}
