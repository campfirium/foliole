import type { ReactNode } from 'react';

import { definedProps } from '@/shared/lib/definedProps';
import { cn } from '@/shared/lib/utils';

interface EmptyStateProps {
  action?: ReactNode;
  className?: string;
  surface?: StateSurfaceScope;
  title: string;
  description: string;
}

type ErrorStateProps = EmptyStateProps;

interface LoadingStateProps {
  className?: string;
  description?: string;
  label?: string;
  surface?: StateSurfaceScope;
  title?: string;
}

type StateSurfaceTone = 'empty' | 'error' | 'loading';
type StateSurfaceScope = 'document' | 'floating' | 'panel';

interface StateSurfaceProps {
  action?: ReactNode;
  ariaBusy?: 'true';
  ariaLabel?: string;
  className?: string;
  description?: string;
  role: 'alert' | 'status';
  surface: StateSurfaceScope;
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

const STATE_SURFACE_SCOPE_CLASS_NAMES: Record<StateSurfaceScope, string> = {
  document: 'min-h-state-surface px-6 py-10',
  floating: 'px-3 py-8',
  panel: 'min-h-state-surface px-settings-panel-x py-settings-panel-y'
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

function AppStateSurface({ action, ariaBusy, ariaLabel, className, description, role, surface, title, tone }: StateSurfaceProps) {
  return (
    <div
      aria-busy={ariaBusy}
      aria-label={ariaLabel}
      className={cn('flex flex-col items-center justify-center gap-3 text-center text-ui-md', STATE_SURFACE_SCOPE_CLASS_NAMES[surface], STATE_SURFACE_TONE_CLASS_NAMES[tone], className)}
      data-state-surface-scope={surface}
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

export function AppEmptyState({ title, description, action, className, surface = 'document' }: EmptyStateProps) {
  return (
    <AppStateSurface
      description={description}
      role="status"
      surface={surface}
      title={title}
      tone="empty"
      {...definedProps({ action, className })}
    />
  );
}

export function AppLoadingState({ className, description, label, surface = 'document', title }: LoadingStateProps) {
  return (
    <AppStateSurface
      ariaBusy="true"
      role="status"
      surface={surface}
      tone="loading"
      {...definedProps({ ariaLabel: label, className, description, title })}
    />
  );
}

export function AppErrorState({ title, description, action, className, surface = 'document' }: ErrorStateProps) {
  return (
    <AppStateSurface
      description={description}
      role="alert"
      surface={surface}
      title={title}
      tone="error"
      {...definedProps({ action, className })}
    />
  );
}
