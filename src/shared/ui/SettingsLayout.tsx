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

export const SETTINGS_BUTTON_WIDTH_CLASS_NAME = '';
export const SETTINGS_ACTION_BUTTON_WIDTH_CLASS_NAME = 'w-36';
export const SETTINGS_INPUT_WIDTH_CLASS_NAME = 'flex-[0_0_160px] max-w-full';
export const SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME = 'flex-[0_0_auto] max-w-full';
export const SETTINGS_COMPOUND_CONTROL_WIDTH_CLASS_NAME = SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME;
export const SETTINGS_INPUT_VALUE_WIDTH_CLASS_NAME = 'w-20';
export const SETTINGS_RANGE_WIDTH_CLASS_NAME = 'w-36';
export const SETTINGS_VALUE_WIDTH_CLASS_NAME = 'min-w-10';
export const SETTINGS_PATH_FIELD_WIDTH_CLASS_NAME = SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME;
export const SETTINGS_PATH_VALUE_WIDTH_CLASS_NAME = 'max-w-80';
export const SETTINGS_PATH_BUTTON_WIDTH_CLASS_NAME = 'w-40 max-w-full';
export const SETTINGS_PATH_CONTROL_CLASS_NAME = 'flex max-w-full items-center justify-end gap-2 max-[1080px]:justify-start';
export const SETTINGS_PATH_RESET_BUTTON_CLASS_NAME = 'size-9 rounded-sm';
export const SETTINGS_ACTION_ROW_CLASS_NAME = 'grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-4 max-[1080px]:grid-cols-1';
export const SETTINGS_SELECT_WIDTH_CLASS_NAME = 'w-auto max-w-[260px]';
export const SETTINGS_SURFACE_SIDEBAR_GRID_CLASS_NAME = 'xl:grid-cols-[minmax(0,1fr)_300px]';
export const SETTINGS_ACTION_TABLE_IMPORT_SOURCE_COLUMNS_CLASS_NAME = '[grid-template-columns:minmax(160px,0.9fr)_minmax(140px,0.75fr)_minmax(108px,0.48fr)_minmax(104px,0.45fr)_minmax(96px,0.42fr)_36px]';
export const SETTINGS_HOTKEY_LIST_COLUMNS_CLASS_NAME = 'grid-cols-[minmax(0,1fr)_auto]';

export type SettingsHotkeyChipState = 'assigned' | 'empty' | 'recording';

export function settingsActionTableClassName(className?: string) {
  return cn('w-full min-w-0 overflow-hidden rounded-md bg-settings-group', className);
}

export function settingsActionTableHeaderClassName(columnsClassName: string, className?: string) {
  return cn(
    'grid gap-3 border-b border-settings-divider px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground/45',
    columnsClassName,
    className
  );
}

export function settingsActionTableRowClassName(columnsClassName: string, className?: string) {
  return cn('grid items-center gap-3 px-4 py-2.5', columnsClassName, className);
}

export function settingsActionTableAddButtonClassName(className?: string) {
  return cn(
    'col-span-full flex h-9 items-center justify-center gap-2 rounded-md border border-dashed border-settings-control-border bg-transparent text-sm text-foreground/60 transition-colors',
    'hover:border-settings-control-border-hover hover:bg-settings-control-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
    className
  );
}


export function settingsHotkeySearchPanelClassName(className?: string) {
  return cn('border-b border-settings-divider/55 px-5 py-4', className);
}

export function settingsHotkeySearchHeaderClassName(className?: string) {
  return cn('mb-3 flex items-center justify-between gap-3', className);
}

export function settingsHotkeySearchFieldClassName(className?: string) {
  return settingsFieldClassName('h-9 w-full pl-9 pr-10', className);
}

export function settingsHotkeyChipClassName(state: SettingsHotkeyChipState, className?: string) {
  return cn(
    'group inline-flex h-7 max-w-[34ch] cursor-pointer items-center justify-center gap-1 rounded-sm border border-transparent bg-settings-control px-2.5 py-0 font-mono text-sm text-foreground transition-colors',
    state === 'recording' && 'bg-settings-control-active text-foreground ring-1 ring-ring',
    state === 'empty' && 'text-foreground/55',
    'hover:bg-settings-control-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
    className
  );
}

export function settingsHotkeyChipClearClassName(className?: string) {
  return cn(
    'inline-flex size-4 shrink-0 items-center justify-center rounded-sm text-foreground/50 transition-colors',
    'hover:bg-settings-control-active hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
    className
  );
}

export function settingsHotkeyToolbarClassName(className?: string) {
  return cn('flex items-center gap-2 border-b border-settings-divider/55 px-5 py-4', className);
}

export function settingsHotkeyRowClassName(className?: string) {
  return cn('grid min-h-14 items-center gap-4 border-t border-settings-divider/55 px-5 py-2.5 first:border-t-0', SETTINGS_HOTKEY_LIST_COLUMNS_CLASS_NAME, className);
}


export function settingsFieldClassName(className?: string) {
  return cn(
    'h-9 w-full min-w-0 rounded-md border border-settings-control-border bg-settings-control px-3 text-sm text-foreground transition-colors',
    'hover:border-settings-control-border-hover hover:bg-settings-control-hover',
    'focus-visible:border-settings-control-border-hover focus-visible:bg-settings-control-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
    'disabled:cursor-not-allowed disabled:opacity-50',
    className
  );
}

export function settingsButtonClassName(className?: string) {
  return cn(
    'inline-flex h-9 shrink-0 cursor-pointer items-center justify-center rounded-md border border-settings-control-border bg-settings-control px-3 text-sm text-foreground/88 transition-colors',
    'hover:border-settings-control-border-hover hover:bg-settings-control-hover hover:text-foreground',
    'active:bg-settings-control-active focus-visible:border-settings-control-border-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
    'disabled:pointer-events-none disabled:opacity-50',
    className
  );
}

export function settingsToggleButtonClassName(active: boolean, className?: string) {
  return settingsButtonClassName(cn(active && 'bg-settings-control-active text-foreground', className));
}

export function settingsSwitchClassName(active: boolean, className?: string) {
  return cn(
    'relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-colors',
    active ? 'bg-settings-switch-on' : 'bg-settings-switch-off',
    'hover:brightness-[0.98] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
    className
  );
}

export function settingsSwitchKnobClassName(active: boolean, className?: string) {
  return cn(
    'absolute size-5 rounded-full bg-settings-switch-knob shadow-sm transition-transform',
    active ? 'translate-x-[22px]' : 'translate-x-0.5',
    className
  );
}

export function settingsIconButtonClassName(className?: string) {
  return settingsButtonClassName(cn('size-9 px-0', className));
}

export function settingsUtilityIconButtonClassName(active = false, className?: string) {
  return cn(
    'inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-md border border-transparent bg-transparent px-0 text-sm transition-colors',
    active ? 'text-settings-icon-active' : 'text-settings-icon',
    '[&>svg]:pointer-events-none [&>svg]:text-current',
    'hover:border-transparent hover:bg-transparent hover:text-settings-icon-hover',
    'active:bg-transparent active:text-settings-icon-active focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
    'disabled:pointer-events-none disabled:opacity-45',
    className
  );
}

export function settingsResetButtonClassName(className?: string) {
  return settingsUtilityIconButtonClassName(false, className);
}

export function settingsColorSwatchClassName(className?: string) {
  return cn('block size-9 rounded-sm border border-settings-control-border transition-colors', className);
}

export function settingsPaletteButtonClassName(active: boolean, className?: string) {
  return cn(
    'min-w-0 cursor-pointer rounded-sm border p-1 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
    active
      ? 'border-settings-control-border-hover bg-settings-control-active'
      : 'border-settings-control-border hover:border-settings-control-border-hover hover:bg-settings-control-hover',
    className
  );
}

export function settingsRangeClassName(className?: string) {
  return cn('accent-[rgb(var(--app-accent-color-rgb))]', className);
}

export function settingsControlValueClassName(className?: string) {
  return cn('text-right text-[0.86rem] text-foreground/65', className);
}

export function settingsColorFieldClassName(className?: string) {
  return cn(
    'h-9 w-14 rounded-md border border-settings-control-border bg-settings-control p-1 transition-colors',
    'hover:border-settings-control-border-hover hover:bg-settings-control-hover',
    'focus-visible:border-settings-control-border-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
    className
  );
}

export function settingsValueBoxClassName(className?: string) {
  return cn('rounded-md border border-transparent bg-settings-control px-3 py-2 text-sm text-foreground/75', className);
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
        'overflow-hidden rounded-md bg-settings-group',
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
        'inline-flex max-w-full flex-[0_0_auto] items-center justify-end gap-2 self-center max-[1080px]:w-full max-[1080px]:flex-auto max-[1080px]:justify-start',
        className
      )}
      data-settings-control-slot
    >
      {children}
    </div>
  );
}
