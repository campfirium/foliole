import { useState } from 'react';

import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
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

const ACTION_BUTTON_CLASS_NAME = settingsButtonClassName(SETTINGS_ACTION_BUTTON_WIDTH_CLASS_NAME);

const SETTINGS_BUTTON_CLASS_NAME = settingsButtonClassName(SETTINGS_ACTION_BUTTON_WIDTH_CLASS_NAME);

type Translate = ReturnType<typeof useTranslation>;

function describeBackupKind(entry: DatabaseBackupEntry, t: Translate) {
  if (entry.kind === 'manual') return t('settings.backups.kind.manual');
  if (entry.kind === 'automatic') return t('settings.backups.kind.auto');
  if (entry.snapshotReason === 'pre-restore') return t('settings.backups.kind.preRestore');
  if (entry.snapshotReason === 'pre-migration') return t('settings.backups.kind.preMigration');
  return t('settings.backups.kind.snapshot');
}

function formatBackupMeta(entry: DatabaseBackupEntry, t: Translate) {
  const updatedAt = Number.isNaN(Date.parse(entry.updatedAt))
    ? entry.updatedAt
    : BACKUP_DATE_FORMATTER.format(new Date(entry.updatedAt));
  const sizeInMegabytes = `${Math.max(1, Math.round(entry.sizeBytes / (1024 * 1024)))} MB`;
  return `${describeBackupKind(entry, t)} · ${updatedAt} · ${sizeInMegabytes}`;
}

export function getBackupFileName(filePath: string) {
  return filePath.split(/[/\\]/).at(-1) || filePath;
}

function toGigabytes(value: number) {
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
  description?: string;
  emptyLabel?: string;
  errorMessage: string;
  isDesktopRuntime: boolean;
  pathButtonLabel?: string;
  restoreLabel?: string;
  title?: string;
  onChangePath: () => void;
  onRestoreDefault: () => void;
}) {
  const t = useTranslation();

  return (
    <SettingsRow description={props.description ?? t('settings.backups.location.description')} title={props.title ?? t('settings.backups.location.title')}>
      <SettingsControlSlot className={`${SETTINGS_PATH_FIELD_WIDTH_CLASS_NAME} items-start max-[1080px]:flex-auto`}>
        <div className="flex max-w-full flex-col items-end gap-1.5 max-[1080px]:items-start">
          <ObjectConfigPathControl
            disabled={!props.isDesktopRuntime}
            emptyLabel={props.emptyLabel ?? t('settings.backups.location.empty')}
            label={props.pathButtonLabel ?? t('settings.backups.location.change')}
            onClick={props.onChangePath}
            onRestoreDefault={props.onRestoreDefault}
            path={props.backupPath}
            restoreLabel={props.restoreLabel}
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
  const t = useTranslation();

  return (
    <SettingsSection ariaLabel={t('settings.backups.rules.sectionAria')} title={t('settings.backups.rules.title')}>
      <NumberRuleRow description={t('settings.backups.rules.hourly.description')} disabled={!props.isDesktopRuntime} onChange={(value) => props.onChangeField('auto_hourly_hours', value)} title={t('settings.backups.rules.hourly.title')} value={String(props.draft.auto_hourly_hours)} />
      <NumberRuleRow description={t('settings.backups.rules.daily.description')} disabled={!props.isDesktopRuntime} onChange={(value) => props.onChangeField('auto_daily_days', value)} title={t('settings.backups.rules.daily.title')} value={String(props.draft.auto_daily_days)} />
      <NumberRuleRow description={t('settings.backups.rules.weekly.description')} disabled={!props.isDesktopRuntime} onChange={(value) => props.onChangeField('auto_weekly_weeks', value)} title={t('settings.backups.rules.weekly.title')} value={String(props.draft.auto_weekly_weeks)} />
      <NumberRuleRow description={t('settings.backups.rules.monthly.description')} disabled={!props.isDesktopRuntime} onChange={(value) => props.onChangeField('auto_monthly_months', value)} title={t('settings.backups.rules.monthly.title')} value={String(props.draft.auto_monthly_months)} />
      <NumberRuleRow description={t('settings.backups.rules.manual.description')} disabled={!props.isDesktopRuntime} onChange={(value) => props.onChangeField('manual_max_count', value)} title={t('settings.backups.rules.manual.title')} value={String(props.draft.manual_max_count)} />
      <NumberRuleRow description={t('settings.backups.rules.snapshots.description')} disabled={!props.isDesktopRuntime} onChange={(value) => props.onChangeField('snapshot_max_count', value)} title={t('settings.backups.rules.snapshots.title')} value={String(props.draft.snapshot_max_count)} />
      <SettingsRow description={t('settings.backups.rules.totalSize.description')} title={t('settings.backups.rules.totalSize.title')}>
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

export function ExtraBackupCopySection(props: {
  draft: DatabaseBackupSettings;
  errorMessage: string;
  isDesktopRuntime: boolean;
  onChangeField: (field: keyof DatabaseBackupSettings, value: string) => void;
  onChangePath: () => void;
  onRestoreDefault: () => void;
}) {
  const t = useTranslation();

  return (
    <SettingsSection ariaLabel={t('settings.backups.extra.sectionAria')} title={t('settings.backups.extra.title')}>
      <BackupPathRow
        backupPath={props.draft.extra_backup_dir}
        defaultBackupPath={props.draft.extra_backup_dir}
        description={t('settings.backups.extra.description')}
        emptyLabel={t('settings.backups.extra.empty')}
        errorMessage={props.errorMessage}
        isDesktopRuntime={props.isDesktopRuntime}
        pathButtonLabel={t('settings.backups.extra.change')}
        restoreLabel={t('settings.backups.extra.turnOff')}
        title={t('settings.backups.extra.locationTitle')}
        onChangePath={props.onChangePath}
        onRestoreDefault={props.onRestoreDefault}
      />
      <NumberRuleRow description={t('settings.backups.extra.kept.description')} disabled={!props.isDesktopRuntime} onChange={(value) => props.onChangeField('extra_backup_max_count', value)} title={t('settings.backups.extra.kept.title')} value={String(props.draft.extra_backup_max_count)} />
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
  const t = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);
  const visibleBackups = isExpanded ? props.backups : props.backups.slice(0, 3);
  const hiddenBackupCount = Math.max(0, props.backups.length - visibleBackups.length);

  return (
    <SettingsSection ariaLabel={t('settings.backups.list.sectionAria')} title={t('settings.backups.title')}>
      <SettingsRow
        description={t('settings.backups.scope.description')}
        readonly
        title={t('settings.backups.scope.title')}
      />
      <SettingsRow description={props.statusMessage || undefined} title={t('settings.backups.create.title')}>
        <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
          <button className={ACTION_BUTTON_CLASS_NAME} disabled={!props.isBackupActionsAvailable || props.isCreatingBackup || props.restoringPath.length > 0} onClick={props.createBackup} type="button">
            {props.isCreatingBackup ? t('settings.backups.create.creating') : t('settings.backups.create.action')}
          </button>
        </SettingsControlSlot>
      </SettingsRow>
      {!props.isBackupActionsAvailable ? <SettingsRow description={t('settings.backups.desktopRequired.description')} readonly title={t('settings.backups.desktopRequired.title')} /> : null}
      {props.isBackupActionsAvailable && props.isLoadingBackups ? <SettingsLoadingState /> : null}
      {props.isBackupActionsAvailable && !props.isLoadingBackups && props.backups.length === 0 ? <SettingsEmptyState description={t('settings.backups.empty.description')} title={t('settings.backups.empty.title')} /> : null}
      {visibleBackups.map((entry) => (
        <SettingsRow description={formatBackupMeta(entry, t)} key={entry.filePath} title={entry.fileName}>
          <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
            <button className={ACTION_BUTTON_CLASS_NAME} disabled={props.isCreatingBackup || props.restoringPath.length > 0} onClick={() => props.restoreBackup(entry)} type="button">
              {props.restoringPath === entry.filePath ? t('settings.backups.restore.restoring') : t('settings.backups.restore.action')}
            </button>
          </SettingsControlSlot>
        </SettingsRow>
      ))}
      {props.isBackupActionsAvailable && !props.isLoadingBackups && props.backups.length > 3 ? (
        <SettingsRow
          title={isExpanded ? t('settings.backups.more.collapse') : t('settings.backups.more.title')}
        >
          <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
            <button className={SETTINGS_BUTTON_CLASS_NAME} onClick={() => setIsExpanded((value) => !value)} type="button">
              {isExpanded ? t('settings.backups.more.showFewer') : t('settings.backups.more.showMore', { count: hiddenBackupCount })}
            </button>
          </SettingsControlSlot>
        </SettingsRow>
      ) : null}
    </SettingsSection>
  );
}
