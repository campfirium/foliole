import { FolderOpen, RotateCcw } from 'lucide-react';
import type { ReactNode } from 'react';

import { useTranslation } from '../localization/LocalizationProvider';

import { AppButton } from './Button';
import {
  SETTINGS_PATH_BUTTON_WIDTH_CLASS_NAME,
  SETTINGS_PATH_CONTROL_CLASS_NAME,
  SETTINGS_PATH_RESET_BUTTON_CLASS_NAME,
  settingsButtonClassName,
  settingsResetButtonClassName
} from './SettingsLayout';

import { cn } from '@/shared/lib/utils';

interface ObjectConfigTableProps {
  children: ReactNode;
  minWidthClassName?: string;
}

interface ObjectConfigHeaderProps {
  columns: Array<{ align?: 'left' | 'right'; label: string }>;
  columnsClassName: string;
}

interface ObjectConfigRowProps {
  children: ReactNode;
  columnsClassName: string;
}

interface ObjectConfigPathButtonProps {
  className?: string;
  disabled?: boolean;
  emptyLabel: string;
  label: string;
  path: string;
  tooltipPath?: string;
  onClick: () => void;
}

interface ObjectConfigPathControlProps extends ObjectConfigPathButtonProps {
  onRestoreDefault: () => void;
  restoreLabel?: string | undefined;
  restoreDisabled?: boolean;
}

function compactPathLabel(path: string, emptyLabel: string) {
  if (path.trim().length === 0) {
    return emptyLabel;
  }
  const parts = path.split(/[\\/]+/).filter(Boolean);
  return parts.at(-1) ?? path;
}

function pathTooltip(path: string) {
  return path.trim().length > 0 ? path : undefined;
}

export function ObjectConfigTable({
  children,
  minWidthClassName = 'min-w-0'
}: ObjectConfigTableProps) {
  return (
    <div className="overflow-x-hidden border-y border-settings-divider">
      <div className={cn(minWidthClassName)}>{children}</div>
    </div>
  );
}

export function ObjectConfigHeader({ columns, columnsClassName }: ObjectConfigHeaderProps) {
  return (
    <div
      className={cn(
        'grid gap-4 px-2 py-3 text-ui-xs font-semibold uppercase tracking-[0.08em] text-foreground/48',
        columnsClassName
      )}
    >
      {columns.map((column) => (
        <span className={column.align === 'right' ? 'text-right' : undefined} key={column.label}>
          {column.label}
        </span>
      ))}
    </div>
  );
}

export function ObjectConfigRow({ children, columnsClassName }: ObjectConfigRowProps) {
  return (
    <div className={cn('grid gap-4 border-t border-settings-divider px-2 py-4', columnsClassName)}>
      {children}
    </div>
  );
}

export function ObjectConfigPathButton({
  className,
  disabled,
  emptyLabel,
  label,
  path,
  tooltipPath,
  onClick
}: ObjectConfigPathButtonProps) {
  const resolvedTooltipPath = tooltipPath ?? path;
  return (
    <AppButton
      aria-label={label}
      className={settingsButtonClassName(`${SETTINGS_PATH_BUTTON_WIDTH_CLASS_NAME} justify-between text-left ${className ?? ''}`)}
      disabled={disabled}
      onClick={onClick}
      title={pathTooltip(resolvedTooltipPath)}
      variant="ghost"
    >
      <span className="min-w-0 truncate">{compactPathLabel(path, emptyLabel)}</span>
      <FolderOpen aria-hidden="true" size={14} strokeWidth={1.8} />
    </AppButton>
  );
}

export function ObjectConfigPathControl({
  onRestoreDefault,
  restoreLabel,
  restoreDisabled,
  ...buttonProps
}: ObjectConfigPathControlProps) {
  const t = useTranslation();
  const resolvedRestoreLabel = restoreLabel ?? t('desktop.objectConfig.restoreDefault');
  return (
    <div className={SETTINGS_PATH_CONTROL_CLASS_NAME} data-settings-path-control>
      <button
        aria-label={resolvedRestoreLabel}
        className={settingsResetButtonClassName(SETTINGS_PATH_RESET_BUTTON_CLASS_NAME)}
        disabled={restoreDisabled ?? buttonProps.disabled}
        onClick={onRestoreDefault}
        title={resolvedRestoreLabel}
        type="button"
      >
        <RotateCcw aria-hidden="true" size={18} strokeWidth={1.9} />
      </button>
      <ObjectConfigPathButton {...buttonProps} />
    </div>
  );
}
