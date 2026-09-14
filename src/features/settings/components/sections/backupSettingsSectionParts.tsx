import { useState } from 'react';

import { useLocalization, useTranslation } from '../../../../shared/localization/LocalizationProvider';
import {
  ObjectConfigPathControl,
  SETTINGS_ACTION_BUTTON_WIDTH_CLASS_NAME,
  SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME,
  SETTINGS_INPUT_WIDTH_CLASS_NAME,
  SETTINGS_PATH_FIELD_WIDTH_CLASS_NAME,
  SettingsButton,
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

const SETTINGS_BUTTON_CLASS_NAME = settingsButtonClassName(SETTINGS_ACTION_BUTTON_WIDTH_CLASS_NAME);

type Localization = ReturnType<typeof useLocalization>;
type Translate = Localization['t'];

function describeBackupKind(entry: DatabaseBackupEntry, t: Translate) {
  if (entry.kind === 'manual') return t('settings.backups.kind.manual');
  if (entry.kind === 'automatic') return t('settings.backups.kind.auto');
  if (entry.snapshotReason === 'pre-restore') return t('settings.backups.kind.preRestore');
  if (entry.snapshotReason === 'pre-compact') return t('settings.backups.kind.preCompact');
  if (entry.snapshotReason === 'pre-migration') return t('settings.backups.kind.preMigration');
  return t('settings.backups.kind.snapshot');
}

function formatBackupMeta(entry: DatabaseBackupEntry, locale: Localization['locale'], t: Translate) {
  const updatedAt = Number.isNaN(Date.parse(entry.updatedAt))
    ? entry.updatedAt
    : new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
      hour12: false
    }).format(new Date(entry.updatedAt));
  const sizeInMegabytes = `${Math.max(1, Math.round(entry.sizeBytes / (1024 * 1024)))} MB`;
  return `${describeBackupKind(entry, t)} · ${updatedAt} · ${sizeInMegabytes}`;
}

export function getBackupFileName(filePath: string) {
  return filePath.split(/[/\\]/).at(-1) || filePath;
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
  const { locale, t } = useLocalization();
  const [isExpanded, setIsExpanded] = useState(false);
  const visibleBackups = isExpanded ? props.backups : props.backups.slice(0, 3);

  return (
    <SettingsSection ariaLabel={t('settings.backups.list.sectionAria')} title={t('settings.backups.title')}>
      <SettingsRow
        description={t('settings.backups.scope.description')}
        readonly
        title={t('settings.backups.scope.title')}
      />
      <SettingsRow description={props.statusMessage || undefined} title={t('settings.backups.create.title')}>
        <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
          <SettingsButton className={SETTINGS_ACTION_BUTTON_WIDTH_CLASS_NAME} disabled={!props.isBackupActionsAvailable || props.restoringPath.length > 0} loading={props.isCreatingBackup} loadingLabel={t('settings.backups.create.creating')} onClick={props.createBackup}>
            {t('settings.backups.create.action')}
          </SettingsButton>
        </SettingsControlSlot>
      </SettingsRow>
      {!props.isBackupActionsAvailable ? <SettingsRow description={t('settings.backups.desktopRequired.description')} readonly title={t('settings.backups.desktopRequired.title')} /> : null}
      {props.isBackupActionsAvailable && props.isLoadingBackups ? <SettingsLoadingState /> : null}
      {props.isBackupActionsAvailable && !props.isLoadingBackups && props.backups.length === 0 ? <SettingsEmptyState description={t('settings.backups.empty.description')} title={t('settings.backups.empty.title')} /> : null}
      {visibleBackups.map((entry) => (
        <SettingsRow description={formatBackupMeta(entry, locale, t)} key={entry.filePath} title={entry.fileName}>
          <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
            <SettingsButton className={SETTINGS_ACTION_BUTTON_WIDTH_CLASS_NAME} disabled={props.isCreatingBackup || props.restoringPath.length > 0} loading={props.restoringPath === entry.filePath} loadingLabel={t('settings.backups.restore.restoring')} onClick={() => props.restoreBackup(entry)}>
              {t('settings.backups.restore.action')}
            </SettingsButton>
          </SettingsControlSlot>
        </SettingsRow>
      ))}
      {props.isBackupActionsAvailable && !props.isLoadingBackups && props.backups.length > 3 ? (
        <SettingsRow className="justify-end">
          <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
            <button className={SETTINGS_BUTTON_CLASS_NAME} onClick={() => setIsExpanded((value) => !value)} type="button">
              {isExpanded ? t('settings.backups.list.collapse') : t('settings.backups.list.showAll')}
            </button>
          </SettingsControlSlot>
        </SettingsRow>
      ) : null}
    </SettingsSection>
  );
}
