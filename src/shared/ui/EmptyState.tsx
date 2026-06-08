import type { ReactNode } from 'react';

import { cn } from '@/shared/lib/utils';

interface EmptyStateProps {
  action?: ReactNode;
  className?: string;
  title: string;
  description: string;
}

type ErrorStateProps = EmptyStateProps;

interface LoadingStateProps {
  className?: string;
  description?: string;
  label?: string;
  title?: string;
}

type StateSurfaceTone = 'empty' | 'error' | 'loading';

interface StateSurfaceProps {
  action?: ReactNode;
  ariaBusy?: 'true';
  ariaLabel?: string;
  className?: string;
  description?: string;
  role: 'alert' | 'status';
  title?: string;
  tone: StateSurfaceTone;
}

type AppSpinnerSize = 'sm' | 'md' | 'lg';
type AppSpinnerTone = 'accent' | 'danger' | 'neutral';

const SPINNER_SIZE_CLASS_NAMES: Record<AppSpinnerSize, string> = {
  lg: 'h-10 w-10',
  md: 'h-6 w-6',
  sm: 'h-4 w-4'
};

const SPINNER_TONE_CLASS_NAMES: Record<AppSpinnerTone, string> = {
  accent: 'border-t-[rgb(var(--app-accent-color-rgb))]',
  danger: 'border-t-error',
  neutral: 'border-t-foreground/55'
};

const STATE_SURFACE_TONE_CLASS_NAMES: Record<StateSurfaceTone, string> = {
  empty: 'text-foreground/60',
  error: 'text-foreground/65',
  loading: 'text-foreground/60'
};

export function AppSpinner({
  className,
  decorative = false,
  label,
  size = 'md',
  tone = 'neutral'
}: {
  className?: string;
  decorative?: boolean;
  label?: string;
  size?: AppSpinnerSize;
  tone?: AppSpinnerTone;
}) {
  return (
    <div
      aria-hidden={decorative ? 'true' : undefined}
      aria-label={!decorative ? label : undefined}
      className={cn(SPINNER_SIZE_CLASS_NAMES[size], 'animate-spin rounded-full border-2 border-border', SPINNER_TONE_CLASS_NAMES[tone], className)}
    />
  );
}

function AppStateSurface({ action, ariaBusy, ariaLabel, className, description, role, title, tone }: StateSurfaceProps) {
  return (
    <div
      aria-busy={ariaBusy}
      aria-label={ariaLabel}
      className={cn('flex min-h-state-surface flex-col items-center justify-center gap-3 text-center text-ui-md', STATE_SURFACE_TONE_CLASS_NAMES[tone], className)}
      data-state-surface-tone={tone}
      role={role}
    >
      {tone === 'loading' ? <AppSpinner decorative tone="accent" /> : null}
      {title || description ? (
        <div className="flex flex-col items-center gap-2">
          {title ? <p className={cn('m-0 text-ui-md font-semibold', tone === 'error' ? 'text-error' : 'text-foreground')}>{title}</p> : null}
          {description ? <p className="m-0 text-ui-base">{description}</p> : null}
        </div>
      ) : null}
      {action ? <div className="flex items-center justify-center">{action}</div> : null}
    </div>
  );
}

export function AppEmptyState({ title, description, action, className }: EmptyStateProps) {
  return <AppStateSurface action={action} className={className} description={description} role="status" title={title} tone="empty" />;
}

export function AppLoadingState({ className, description, label, title }: LoadingStateProps) {
  return <AppStateSurface ariaBusy="true" ariaLabel={label} className={className} description={description} role="status" title={title} tone="loading" />;
}

export function AppErrorState({ title, description, action, className }: ErrorStateProps) {
  return <AppStateSurface action={action} className={className} description={description} role="alert" title={title} tone="error" />;
}
