import { cn } from '@/shared/lib/utils';

export const SETTINGS_ACTION_TABLE_IMPORT_SOURCE_COLUMNS_CLASS_NAME = '[grid-template-columns:minmax(160px,0.9fr)_minmax(140px,0.75fr)_minmax(108px,0.48fr)_minmax(104px,0.45fr)_minmax(96px,0.42fr)_36px]';
export const SETTINGS_ACTION_TABLE_EXTERNAL_LIBRARY_COLUMNS_CLASS_NAME = '[grid-template-columns:minmax(132px,0.72fr)_minmax(120px,0.62fr)_minmax(120px,0.62fr)_minmax(120px,0.5fr)_104px]';

export function settingsActionTableClassName(className?: string) {
  return cn('w-full min-w-0 overflow-hidden rounded-md bg-settings-group', className);
}

export function settingsActionTableHeaderClassName(columnsClassName: string, className?: string) {
  return cn(
    'relative grid gap-3 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground/45 after:absolute after:bottom-0 after:left-4 after:right-4 after:border-b after:border-settings-divider',
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
    'hover:border-settings-control-border-hover hover:bg-settings-control-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-45',
    className
  );
}
