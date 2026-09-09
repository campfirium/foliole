import type { ReactNode } from 'react';

import type {
  ReadwiseReaderConfig,
  ReadwiseSyncFrequency
} from '../../../lib/core/import/readwiseReaderSettings';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import {
  AppButton,
  SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME,
  SETTINGS_SELECT_WIDTH_CLASS_NAME,
  SettingsControlSlot,
  SettingsRow,
  settingsFieldClassName
} from '../../shared/ui';

import type { ReadwiseManualSyncStatus } from './useReadwiseManualSync';

function ReadwiseSyncStatusMessage(props: { status: ReadwiseManualSyncStatus }) {
  if (!props.status.message) {
    return null;
  }
  return (
    <span
      aria-live="polite"
      className={
        props.status.tone === 'error'
          ? 'mt-1 block text-red-700'
          : 'mt-1 block text-foreground/70'
      }
      role="status"
    >
      {props.status.message}
      {props.status.failedSources.length ? (
        <span className="mt-1 block space-y-1 text-xs leading-5">
          {props.status.failedSources.map((source) => (
            <span className="block break-words" key={`${source.sourceKind}:${source.sourcePath}`}>
              {source.sourcePath}: {source.reason}
            </span>
          ))}
        </span>
      ) : null}
    </span>
  );
}

export function ReadwiseReaderSyncRow(props: {
  actionLabel?: string | undefined;
  config: ReadwiseReaderConfig;
  detail?: ReactNode;
  disabled: boolean;
  isSyncing?: boolean;
  loadingLabel?: string | undefined;
  onChange: (field: keyof ReadwiseReaderConfig, value: string) => void;
  onSync: () => void;
  status?: ReadwiseManualSyncStatus;
}) {
  const t = useTranslation();
  const description = (
    <>
      {t('desktop.readwise.sync.description')}
      {props.detail ? <span className="mt-1 block">{props.detail}</span> : null}
      {props.status ? <ReadwiseSyncStatusMessage status={props.status} /> : null}
    </>
  );

  return (
    <SettingsRow description={description} title={t('desktop.readwise.sync.title')}>
      <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
        <ReadwiseSyncFrequencySelect
          disabled={props.disabled}
          onChange={(value) => props.onChange('syncFrequency', value)}
          value={props.config.syncFrequency}
        />
        <AppButton disabled={props.disabled} loading={Boolean(props.isSyncing)} loadingLabel={props.loadingLabel ?? t('desktop.readwise.sync.running')} onClick={props.onSync} size="sm" variant="default">
          {props.actionLabel ?? t('desktop.readwise.sync.action')}
        </AppButton>
      </SettingsControlSlot>
    </SettingsRow>
  );
}

export function ReadwiseSyncFrequencySelect(props: {
  disabled?: boolean;
  onChange: (value: ReadwiseSyncFrequency) => void;
  value: ReadwiseSyncFrequency;
}) {
  const t = useTranslation();
  const options = [
    { label: t('desktop.readwise.sync.frequency.hourly'), value: 'hourly' },
    { label: t('desktop.readwise.sync.frequency.every12Hours'), value: 'every_12_hours' },
    { label: t('desktop.readwise.sync.frequency.daily'), value: 'daily' },
    { label: t('desktop.readwise.sync.frequency.weekly'), value: 'weekly' }
  ] as const;

  return (
    <select
      aria-label={t('desktop.readwise.sync.frequency.aria')}
      className={settingsFieldClassName(SETTINGS_SELECT_WIDTH_CLASS_NAME)}
      disabled={props.disabled}
      onChange={(event) => props.onChange(event.target.value as ReadwiseSyncFrequency)}
      value={props.value}
    >
      {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  );
}
