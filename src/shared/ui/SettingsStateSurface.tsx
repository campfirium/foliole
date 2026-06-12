import type { ReactNode } from 'react';

import { AppSpinner } from './EmptyState';
import {
  SETTINGS_ACTION_BUTTON_WIDTH_CLASS_NAME,
  settingsButtonClassName
} from './SettingsLayout';

import { definedProps } from '@/shared/lib/definedProps';
import { cn } from '@/shared/lib/utils';

interface SettingsStateSurfaceProps {
  action?: ReactNode;
  className?: string;
  description: ReactNode;
  title: string;
}

interface SettingsLoadingStateProps {
  className?: string;
  description?: ReactNode;
  title?: string;
}

interface SettingsStateActionProps {
  label: string;
  onClick: () => void;
}

type SettingsStateSurfaceTone = 'empty' | 'error' | 'loading';

const SETTINGS_STATE_TITLE_CLASS_NAMES: Record<SettingsStateSurfaceTone, string> = {
  empty: 'text-foreground/72',
  error: 'text-error',
  loading: 'text-foreground/72'
};

function SettingsStateSurface({
  action,
  className,
  description,
  tone,
  title,
  ...rest
}: SettingsStateSurfaceProps & { role: 'alert' | 'status'; 'aria-busy'?: 'true'; tone: SettingsStateSurfaceTone }) {
  return (
    <div
      className={cn('flex min-h-settings-row flex-col justify-center gap-2 px-settings-panel-x py-settings-panel-y text-ui-md text-foreground/65', className)}
      data-settings-state-surface
      data-state-surface-scope="settings"
      data-state-surface-tone={tone}
      {...rest}
    >
      <div>
        <p className={cn('m-0 text-ui-lg font-normal', SETTINGS_STATE_TITLE_CLASS_NAMES[tone])}>{title}</p>
        <p className="m-0 mt-0.5 text-ui-md text-foreground/65">{description}</p>
      </div>
      {action ? <div className="flex items-center">{action}</div> : null}
    </div>
  );
}

export function SettingsLoadingState({ className, description, title }: SettingsLoadingStateProps) {
  if (title || description) {
    return (
      <SettingsStateSurface
        aria-busy="true"
        description={description ?? ''}
        role="status"
        title={title ?? ''}
        tone="loading"
        {...definedProps({ className })}
      />
    );
  }
  return (
    <div
      aria-busy="true"
      className={cn('flex min-h-settings-row items-center justify-center px-settings-panel-x py-settings-panel-y text-foreground/65', className)}
      data-settings-state-surface
      data-state-surface-scope="settings"
      data-state-surface-tone="loading"
      role="status"
    >
      <AppSpinner decorative tone="neutral" />
    </div>
  );
}

export function SettingsEmptyState(props: SettingsStateSurfaceProps) {
  return <SettingsStateSurface role="status" tone="empty" {...props} />;
}

export function SettingsErrorState(props: SettingsStateSurfaceProps) {
  return <SettingsStateSurface role="alert" tone="error" {...props} />;
}

export function SettingsStateAction({ label, onClick }: SettingsStateActionProps) {
  return (
    <button
      className={settingsButtonClassName(SETTINGS_ACTION_BUTTON_WIDTH_CLASS_NAME)}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}
