import { FolderOpen } from 'lucide-react';
import type { ReactNode } from 'react';

import { AppButton } from './Button';
import { SETTINGS_PATH_BUTTON_WIDTH_CLASS_NAME, settingsButtonClassName } from './SettingsLayout';

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
  disabled?: boolean;
  emptyLabel: string;
  label: string;
  path: string;
  onClick: () => void;
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
        'grid gap-4 px-2 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground/48',
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
  disabled,
  emptyLabel,
  label,
  path,
  onClick
}: ObjectConfigPathButtonProps) {
  return (
    <AppButton
      aria-label={label}
      className={settingsButtonClassName(`${SETTINGS_PATH_BUTTON_WIDTH_CLASS_NAME} justify-between text-left`)}
      disabled={disabled}
      onClick={onClick}
      title={disabled ? undefined : pathTooltip(path)}
      variant="ghost"
    >
      <span className="min-w-0 truncate">{compactPathLabel(path, emptyLabel)}</span>
      <FolderOpen aria-hidden="true" size={14} strokeWidth={1.8} />
    </AppButton>
  );
}
