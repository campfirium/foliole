import { FolderOpen, RotateCcw } from 'lucide-react';

import { useTranslation } from '../localization/LocalizationProvider';

import { AppButton } from './Button';
import {
  SETTINGS_PATH_BUTTON_WIDTH_CLASS_NAME,
  SETTINGS_PATH_CONTROL_CLASS_NAME,
  SETTINGS_PATH_RESET_BUTTON_CLASS_NAME,
  settingsButtonClassName,
  settingsResetButtonClassName
} from './SettingsLayout';

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
      className={settingsButtonClassName(`${SETTINGS_PATH_BUTTON_WIDTH_CLASS_NAME} text-left ${className ?? ''}`)}
      contentClassName="flex-1 justify-between"
      disabled={disabled}
      onClick={onClick}
      title={pathTooltip(resolvedTooltipPath)}
      variant="ghost"
    >
      <span className="min-w-0 truncate">{compactPathLabel(path, emptyLabel)}</span>
      <FolderOpen aria-hidden="true" className="shrink-0" size={14} strokeWidth={1.8} />
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
