import type { ReactNode } from 'react';

import { cn } from '@/shared/lib/utils';

interface EmptyStateProps {
  className?: string;
  title: string;
  description: string;
}

interface ErrorStateProps extends EmptyStateProps {
  action?: ReactNode;
}

export function AppEmptyState({ title, description, className }: EmptyStateProps) {
  return (
    <div className={cn('flex min-h-[120px] flex-col items-center justify-center gap-2 text-center text-sm text-foreground/60', className)} role="status">
      <p className="m-0 text-sm font-semibold text-foreground">{title}</p>
      <p className="m-0 text-[13px]">{description}</p>
    </div>
  );
}

export function AppLoadingState({ title, description, className }: EmptyStateProps) {
  return (
    <div aria-busy="true" className={cn('flex min-h-[120px] flex-col items-center justify-center gap-3 text-center text-sm text-foreground/60', className)} role="status">
      <div aria-label={`${title} indicator`} className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-foreground/55" />
      <div className="flex flex-col items-center gap-2">
        <p className="m-0 text-sm font-semibold text-foreground">{title}</p>
        <p className="m-0 text-[13px]">{description}</p>
      </div>
    </div>
  );
}

export function AppErrorState({ title, description, action, className }: ErrorStateProps) {
  return (
    <div className={cn('flex min-h-[120px] flex-col items-center justify-center gap-3 text-center text-sm text-foreground/65', className)} role="alert">
      <div className="flex flex-col items-center gap-2">
        <p className="m-0 text-sm font-semibold text-foreground">{title}</p>
        <p className="m-0 text-[13px]">{description}</p>
      </div>
      {action ? <div className="flex items-center justify-center">{action}</div> : null}
    </div>
  );
}
