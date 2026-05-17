import type { ReactNode } from 'react';

import { AppSpinner } from './EmptyState';
import {
  SETTINGS_ACTION_BUTTON_WIDTH_CLASS_NAME,
  settingsButtonClassName
} from './SettingsLayout';

import { cn } from '@/shared/lib/utils';

interface SettingsStateSurfaceProps {
  action?: ReactNode;
  className?: string;
  description: ReactNode;
  title: string;
}

interface SettingsStateActionProps {
  label: string;
  onClick: () => void;
}

function SettingsStateSurface({
  action,
  className,
  description,
  title,
  ...rest
}: SettingsStateSurfaceProps & { role: 'alert' | 'status'; 'aria-busy'?: 'true' }) {
  return (
    <div
      className={cn('flex min-h-[82px] flex-col justify-center gap-2 px-5 py-5 text-sm text-foreground/65', className)}
      data-settings-state-surface
      {...rest}
    >
      <div>
        <p className="m-0 text-[0.95rem] font-normal text-foreground">{title}</p>
        <p className="m-0 mt-0.5 text-sm text-foreground/65">{description}</p>
      </div>
      {action ? <div className="flex items-center">{action}</div> : null}
    </div>
  );
}

export function SettingsLoadingState({ className }: { className?: string }) {
  return (
    <div
      aria-busy="true"
      className={cn('flex min-h-[82px] items-center justify-center px-5 py-5 text-foreground/65', className)}
      data-settings-state-surface
      role="status"
    >
      <AppSpinner decorative />
    </div>
  );
}

export function SettingsEmptyState(props: SettingsStateSurfaceProps) {
  return <SettingsStateSurface role="status" {...props} />;
}

export function SettingsErrorState(props: SettingsStateSurfaceProps) {
  return <SettingsStateSurface role="alert" {...props} />;
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
