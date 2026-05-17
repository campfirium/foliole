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

interface LoadingStateProps {
  className?: string;
}

type AppSpinnerSize = 'sm' | 'md' | 'lg';

const SPINNER_SIZE_CLASS_NAMES: Record<AppSpinnerSize, string> = {
  lg: 'h-10 w-10',
  md: 'h-6 w-6',
  sm: 'h-4 w-4'
};

export function AppSpinner({
  className,
  decorative = false,
  label,
  size = 'md'
}: {
  className?: string;
  decorative?: boolean;
  label?: string;
  size?: AppSpinnerSize;
}) {
  return (
    <div
      aria-hidden={decorative ? 'true' : undefined}
      aria-label={!decorative ? label : undefined}
      className={cn(SPINNER_SIZE_CLASS_NAMES[size], 'animate-spin rounded-full border-2 border-border border-t-foreground/55', className)}
    />
  );
}

export function AppEmptyState({ title, description, className }: EmptyStateProps) {
  return (
    <div className={cn('flex min-h-[120px] flex-col items-center justify-center gap-2 text-center text-sm text-foreground/60', className)} role="status">
      <p className="m-0 text-sm font-semibold text-foreground">{title}</p>
      <p className="m-0 text-[13px]">{description}</p>
    </div>
  );
}

export function AppLoadingState({ className }: LoadingStateProps) {
  return (
    <div aria-busy="true" className={cn('flex min-h-[120px] items-center justify-center text-foreground/60', className)} role="status">
      <AppSpinner decorative />
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
