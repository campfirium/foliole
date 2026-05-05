import type { ReactNode } from 'react';

import { cn } from '@/shared/lib/utils';

interface SettingsSectionProps {
  actions?: ReactNode;
  ariaLabel?: string;
  children: ReactNode;
  className?: string;
  description?: string;
  title?: string;
}

interface SettingsRowProps {
  children?: ReactNode;
  className?: string;
  description?: ReactNode;
  readonly?: boolean;
  title: string;
}

export const SETTINGS_BUTTON_WIDTH_CLASS_NAME = 'min-w-[136px]';
export const SETTINGS_INPUT_WIDTH_CLASS_NAME = 'flex-[0_0_160px] max-w-full';
export const SETTINGS_PATH_FIELD_WIDTH_CLASS_NAME = 'flex-[0_0_320px] max-w-full';

export function settingsFieldClassName(className?: string) {
  return cn(
    'h-9 w-full min-w-0 rounded-md border border-border bg-settings-control px-3 text-sm text-foreground',
    'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border-strong',
    className
  );
}

export function settingsButtonClassName(className?: string) {
  return cn(
    'inline-flex h-9 shrink-0 items-center justify-center rounded-md border border-border bg-settings-control px-3 text-sm text-foreground/88 transition-colors',
    'hover:bg-settings-control-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
    'disabled:pointer-events-none disabled:opacity-50',
    className
  );
}

export function settingsIconButtonClassName(className?: string) {
  return settingsButtonClassName(cn('size-9 px-0', className));
}

export function settingsColorFieldClassName(className?: string) {
  return cn(
    'h-9 w-14 rounded-md border border-border bg-settings-control p-1',
    'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border-strong',
    className
  );
}

export function settingsValueBoxClassName(className?: string) {
  return cn('rounded-md bg-settings-control px-3 py-2 text-sm text-foreground/75', className);
}

export function SettingsSection({
  actions,
  ariaLabel,
  children,
  className,
  description,
  title
}: SettingsSectionProps) {
  const hasHeader = Boolean(title || description || actions);

  return (
    <section aria-label={ariaLabel} className={cn('mb-8 space-y-3 last:mb-0', className)}>
      {hasHeader ? (
        <div className="flex items-start justify-between gap-4 px-5">
          <div className="min-w-0">
            {title ? <h3 className="text-[0.95rem] font-semibold text-foreground">{title}</h3> : null}
            {description ? <p className="mt-1 max-w-[760px] text-sm leading-6 text-foreground/60">{description}</p> : null}
          </div>
          {actions ? <div className="shrink-0">{actions}</div> : null}
        </div>
      ) : null}
      <div
        className={cn(
          'overflow-hidden rounded-md bg-settings-group',
          '[&>[data-settings-row]+[data-settings-row]]:before:block'
        )}
      >
        {children}
      </div>
    </section>
  );
}

export function SettingsGroup({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-md bg-bg-elevated/50',
        className
      )}
    >
      {children}
    </div>
  );
}

export function SettingsRow({ children, className, description, readonly = false, title }: SettingsRowProps) {
  return (
    <div
      className={cn(
        'relative flex min-h-[82px] items-start justify-between gap-6 px-5 py-5 before:absolute before:left-5 before:right-5 before:top-0 before:hidden before:border-t before:border-settings-divider/55 first:before:hidden max-[1080px]:flex-col max-[1080px]:items-start',
        readonly && 'text-foreground/80',
        className
      )}
      data-settings-row
    >
      <div className="min-w-0 flex-1">
        <h4 className="text-[0.95rem] font-normal text-foreground">{title}</h4>
        {description ? <p className="mt-0.5 text-sm text-foreground/65">{description}</p> : null}
      </div>
      {children}
    </div>
  );
}

export function SettingsControlSlot({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'inline-flex max-w-full flex-[0_0_240px] items-center justify-end gap-2 self-center max-[1080px]:w-full max-[1080px]:flex-auto max-[1080px]:justify-start',
        className
      )}
    >
      {children}
    </div>
  );
}
