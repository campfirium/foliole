import { useState } from 'react';

import {
  ObjectConfigPathControl,
  SETTINGS_ACTION_BUTTON_WIDTH_CLASS_NAME,
  SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME,
  SETTINGS_INPUT_WIDTH_CLASS_NAME,
  SETTINGS_PATH_FIELD_WIDTH_CLASS_NAME,
  SettingsControlSlot,
  SettingsEmptyState,
  SettingsLoadingState,
  SettingsRow,
  SettingsSection,
  settingsButtonClassName,
  settingsFieldClassName
} from '../../../../shared/ui';
import type { DatabaseBackupEntry } from '../../model/databaseBackups';
import type { DatabaseBackupSettings } from '../../model/databaseBackupSettings';

const BACKUP_DATE_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'medium',
  timeStyle: 'short',
  hour12: false
});

export const ACTION_BUTTON_CLASS_NAME = settingsButtonClassName(SETTINGS_ACTION_BUTTON_WIDTH_CLASS_NAME);

const SETTINGS_BUTTON_CLASS_NAME = settingsButtonClassName(SETTINGS_ACTION_BUTTON_WIDTH_CLASS_NAME);

function describeBackupKind(entry: DatabaseBackupEntry) {
  if (entry.kind === 'manual') return 'Manual backup';
  if (entry.kind === 'automatic') {
    return entry.autoFrequency ? `Auto backup · ${entry.autoFrequency}` : 'Auto backup';
  }
  if (entry.snapshotReason === 'pre-restore') return 'Safety snapshot before restore';
  if (entry.snapshotReason === 'pre-migration') return 'Safety snapshot before upgrade';
  return 'Safety snapshot';
}

function formatBackupMeta(entry: DatabaseBackupEntry) {
  const updatedAt = Number.isNaN(Date.parse(entry.updatedAt))
    ? entry.updatedAt
    : BACKUP_DATE_FORMATTER.format(new Date(entry.updatedAt));
  const sizeInMegabytes = `${Math.max(1, Math.round(entry.sizeBytes / (1024 * 1024)))} MB`;
  return `${describeBackupKind(entry)} · ${updatedAt} · ${sizeInMegabytes}`;
}

export function getBackupFileName(filePath: string) {
  return filePath.split(/[/\\]/).at(-1) || filePath;
}

export function toGigabytes(value: number) {
  return Number((value / (1024 * 1024 * 1024)).toFixed(1)).toString();
}

function NumberRuleRow(props: {
  description: string;
  disabled: boolean;
  onChange: (value: string) => void;
  title: string;
  value: string;
}) {
  return (
    <SettingsRow description={props.description} title={props.title}>
      <SettingsControlSlot className={SETTINGS_INPUT_WIDTH_CLASS_NAME}>
        <input
          className={settingsFieldClassName('[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none')}
          disabled={props.disabled}
          inputMode="numeric"
          min="0"
          onChange={(event) => props.onChange(event.target.value)}
          type="number"
          value={props.value}
        />
      </SettingsControlSlot>
    </SettingsRow>
  );
}

export function BackupPathRow(props: {
  backupPath: string;
  defaultBackupPath: string;
  errorMessage: string;
  isDesktopRuntime: boolean;
  onChangePath: () => void;
  onRestoreDefault: () => void;
}) {
  return (
    <SettingsRow description="Backups, auto backups, and safety snapshots are all stored in this folder." title="Backup location">
      <SettingsControlSlot className={`${SETTINGS_PATH_FIELD_WIDTH_CLASS_NAME} items-start max-[1080px]:flex-auto`}>
        <div className="flex max-w-full flex-col items-end gap-1.5 max-[1080px]:items-start">
          <ObjectConfigPathControl
            disabled={!props.isDesktopRuntime}
            emptyLabel="Backups"
            label="Change location"
            onClick={props.onChangePath}
            onRestoreDefault={props.onRestoreDefault}
            path={props.backupPath}
            tooltipPath={props.defaultBackupPath}
          />
          {props.errorMessage ? <p className="max-w-80 text-right text-sm text-error max-[1080px]:text-left">{props.errorMessage}</p> : null}
        </div>
      </SettingsControlSlot>
    </SettingsRow>
  );
}

export function BackupRulesSection(props: {
  draft: DatabaseBackupSettings;
  isDesktopRuntime: boolean;
  onChangeField: (field: keyof DatabaseBackupSettings, value: string) => void;
}) {
  return (
    <SettingsSection ariaLabel="Backup settings section" title="Backup rules">
      <NumberRuleRow description="Keep 1 auto backup per hour within this window." disabled={!props.isDesktopRuntime} onChange={(value) => props.onChangeField('auto_hourly_hours', value)} title="Hourly window (hours)" value={String(props.draft.auto_hourly_hours)} />
      <NumberRuleRow description="Keep 1 auto backup per day within this window." disabled={!props.isDesktopRuntime} onChange={(value) => props.onChangeField('auto_daily_days', value)} title="Daily window (days)" value={String(props.draft.auto_daily_days)} />
      <NumberRuleRow description="Keep 1 auto backup per week within this window." disabled={!props.isDesktopRuntime} onChange={(value) => props.onChangeField('auto_weekly_weeks', value)} title="Weekly window (weeks)" value={String(props.draft.auto_weekly_weeks)} />
      <NumberRuleRow description="Keep 1 auto backup per month within this window. Set to 0 to turn monthly backups off." disabled={!props.isDesktopRuntime} onChange={(value) => props.onChangeField('auto_monthly_months', value)} title="Monthly window (months)" value={String(props.draft.auto_monthly_months)} />
      <NumberRuleRow description="Manual backups keep the newest entries only." disabled={!props.isDesktopRuntime} onChange={(value) => props.onChangeField('manual_max_count', value)} title="Manual backups kept" value={String(props.draft.manual_max_count)} />
      <NumberRuleRow description="Safety snapshots are created before restore and upgrade." disabled={!props.isDesktopRuntime} onChange={(value) => props.onChangeField('snapshot_max_count', value)} title="Safety snapshots kept" value={String(props.draft.snapshot_max_count)} />
      <SettingsRow description="When backups grow past this size, the oldest backup is deleted first." title="Total backup size limit (GB)">
        <SettingsControlSlot className={SETTINGS_INPUT_WIDTH_CLASS_NAME}>
          <input
            className={settingsFieldClassName('[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none')}
            disabled={!props.isDesktopRuntime}
            inputMode="decimal"
            min="0"
            onChange={(event) => props.onChangeField('total_size_limit_bytes', event.target.value)}
            type="number"
            value={toGigabytes(props.draft.total_size_limit_bytes)}
          />
        </SettingsControlSlot>
      </SettingsRow>
    </SettingsSection>
  );
}

export function BackupListSection(props: {
  backups: DatabaseBackupEntry[];
  isBackupActionsAvailable: boolean;
  isCreatingBackup: boolean;
  isLoadingBackups: boolean;
  restoringPath: string;
  statusMessage: string;
  createBackup: () => void;
  restoreBackup: (entry: DatabaseBackupEntry) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const visibleBackups = isExpanded ? props.backups : props.backups.slice(0, 3);
  const hiddenBackupCount = Math.max(0, props.backups.length - visibleBackups.length);

  return (
    <SettingsSection ariaLabel="Backup list section" title="Backups">
      <SettingsRow description={props.statusMessage || undefined} title="Create backup">
        <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
          <button className={ACTION_BUTTON_CLASS_NAME} disabled={!props.isBackupActionsAvailable || props.isCreatingBackup || props.restoringPath.length > 0} onClick={props.createBackup} type="button">
            {props.isCreatingBackup ? 'Creating…' : 'Create backup'}
          </button>
        </SettingsControlSlot>
      </SettingsRow>
      {!props.isBackupActionsAvailable ? <SettingsRow description="Backup management is available in the desktop app." readonly title="Desktop runtime required" /> : null}
      {props.isBackupActionsAvailable && props.isLoadingBackups ? <SettingsLoadingState description="Scanning the backup folder." title="Loading backups" /> : null}
      {props.isBackupActionsAvailable && !props.isLoadingBackups && props.backups.length === 0 ? <SettingsEmptyState description="No backups yet." title="Empty backup list" /> : null}
      {visibleBackups.map((entry) => (
        <SettingsRow description={formatBackupMeta(entry)} key={entry.filePath} title={entry.fileName}>
          <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
            <button className={ACTION_BUTTON_CLASS_NAME} disabled={props.isCreatingBackup || props.restoringPath.length > 0} onClick={() => props.restoreBackup(entry)} type="button">
              {props.restoringPath === entry.filePath ? 'Restoring…' : 'Restore'}
            </button>
          </SettingsControlSlot>
        </SettingsRow>
      ))}
      {props.isBackupActionsAvailable && !props.isLoadingBackups && props.backups.length > 3 ? (
        <SettingsRow
          title={isExpanded ? 'Collapse backup list' : 'More backups'}
        >
          <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
            <button className={SETTINGS_BUTTON_CLASS_NAME} onClick={() => setIsExpanded((value) => !value)} type="button">
              {isExpanded ? 'Show fewer' : `Show ${hiddenBackupCount} more`}
            </button>
          </SettingsControlSlot>
        </SettingsRow>
      ) : null}
    </SettingsSection>
  );
}
