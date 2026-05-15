import type { ReadwiseReaderConfig } from '../../../lib/core/import/readwiseReaderSettings';
import {
  AppButton,
  SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME,
  SETTINGS_SELECT_WIDTH_CLASS_NAME,
  SettingsControlSlot,
  SettingsRow,
  settingsFieldClassName
} from '../../shared/ui';

import type { ReadwiseManualSyncStatus } from './useReadwiseManualSync';

const SYNC_FREQUENCY_OPTIONS = [
  { label: 'Every 1 hour', value: 'hourly' },
  { label: 'Every 12 hours', value: 'every_12_hours' },
  { label: 'Every 24 hours', value: 'daily' },
  { label: 'Every week', value: 'weekly' }
];

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
  config: ReadwiseReaderConfig;
  disabled: boolean;
  isSyncing?: boolean;
  onChange: (field: keyof ReadwiseReaderConfig, value: string) => void;
  onSync: () => void;
  status?: ReadwiseManualSyncStatus;
}) {
  const description = (
    <>
      Automatically scan while Foliole is open, or start a scan with the current settings.
      {props.status ? <ReadwiseSyncStatusMessage status={props.status} /> : null}
    </>
  );

  return (
    <SettingsRow description={description} title="Sync">
      <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
        <select
          aria-label="Sync frequency"
          className={settingsFieldClassName(SETTINGS_SELECT_WIDTH_CLASS_NAME)}
          onChange={(event) => props.onChange('syncFrequency', event.target.value)}
          value={props.config.syncFrequency}
        >
          {SYNC_FREQUENCY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <AppButton disabled={props.disabled} onClick={props.onSync} size="sm" variant="primary">
          {props.isSyncing ? 'Syncing...' : 'Sync'}
        </AppButton>
      </SettingsControlSlot>
    </SettingsRow>
  );
}
