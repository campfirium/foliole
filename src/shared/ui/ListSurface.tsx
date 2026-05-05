import type { ReactNode } from 'react';

import { AppEmptyState } from './EmptyState';

import { cn } from '@/shared/lib/utils';

interface AppListSurfaceProps {
  ariaLabel?: string;
  children?: ReactNode;
  className?: string;
  emptyState?: {
    description: string;
    title: string;
  };
  header?: ReactNode;
  headerSeparated?: boolean;
  isEmpty?: boolean;
}

interface AppListHeaderProps {
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
}

interface AppListSectionHeaderProps {
  countLabel?: ReactNode;
  description?: ReactNode;
  title: ReactNode;
  toolbar?: ReactNode;
}

interface AppListItemProps {
  actions?: ReactNode;
  ariaLabel?: string;
  className?: string;
  disabled?: boolean;
  interactive?: boolean;
  metaAfterSummary?: boolean;
  meta?: ReactNode;
  onClick?: () => void;
  actionsSeparated?: boolean;
  divided?: boolean;
  summaryClassName?: string;
  summary?: ReactNode;
  title: ReactNode;
  trailing?: ReactNode;
  type?: 'button' | 'submit' | 'reset';
}

export function AppListSurface({
  ariaLabel,
  children,
  className,
  emptyState,
  header,
  headerSeparated = true,
  isEmpty = false
}: AppListSurfaceProps) {
  return (
    <section
      aria-label={ariaLabel}
      className={cn('flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-bg-panel', className)}
    >
      {header ? <div className={cn('px-4 py-3', headerSeparated && 'border-b border-border')}>{header}</div> : null}
      {isEmpty ? (
        <div className="flex min-h-0 flex-1 items-center justify-center px-6 py-10">
          {emptyState ? <AppEmptyState description={emptyState.description} title={emptyState.title} /> : null}
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      )}
    </section>
  );
}

export function AppListHeader({ actions, children, className }: AppListHeaderProps) {
  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-3', className)}>
      <div className="min-w-0 flex-1">{children}</div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </div>
  );
}

export function AppListSectionHeader({ countLabel, description, title, toolbar }: AppListSectionHeaderProps) {
  return (
    <div className="flex flex-col gap-3">
      <AppListHeader actions={countLabel ? <p className="text-sm text-foreground/65">{countLabel}</p> : null} className="items-start gap-y-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          {description ? <p className="mt-1 text-sm text-foreground/65">{description}</p> : null}
        </div>
      </AppListHeader>
      {toolbar ? <div className="flex flex-wrap items-center gap-2 text-sm text-foreground/72">{toolbar}</div> : null}
    </div>
  );
}

export function AppListItem({
  actions,
  ariaLabel,
  className,
  disabled = false,
  interactive = true,
  metaAfterSummary = false,
  meta,
  onClick,
  actionsSeparated = true,
  divided = true,
  summaryClassName,
  summary,
  title,
  trailing,
  type = 'button'
}: AppListItemProps) {
  const Component = interactive ? 'button' : 'div';

  return (
    <Component
      aria-label={ariaLabel}
      className={cn(
        'flex w-full flex-col gap-3 px-4 py-4 text-left',
        divided && 'border-b border-border/70 last:border-b-0',
        interactive && 'transition-colors hover:bg-bg-elevated/80 focus-visible:bg-bg-elevated/80 focus-visible:outline-none',
        disabled && 'pointer-events-none opacity-50',
        className
      )}
      {...(interactive ? { disabled, onClick, type } : {})}
      >
      <div className="flex items-start justify-between gap-5">
        <div className="min-w-0 flex-1">
          <div className="min-w-0 text-sm font-semibold leading-5 text-foreground">{title}</div>
          {meta && !metaAfterSummary ? <div className="mt-1 min-w-0 text-xs leading-5 text-foreground/52">{meta}</div> : null}
          {summary ? <div className={cn('mt-2 min-w-0 text-sm leading-6 text-foreground/68', summaryClassName)}>{summary}</div> : null}
          {meta && metaAfterSummary ? (
            <div className={cn('min-w-0 text-xs leading-5 text-foreground/52', metaAfterSummary ? 'mt-3' : 'mt-1')}>
              {meta}
            </div>
          ) : null}
        </div>
        {trailing ? <div className="w-36 shrink-0 text-right text-xs leading-5 text-foreground/56">{trailing}</div> : null}
      </div>
      {actions ? <div className={cn('mt-1 pt-3', actionsSeparated && 'border-t border-border/50')}>{actions}</div> : null}
    </Component>
  );
}
