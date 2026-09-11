import { useEffect, useState } from 'react';

import type { ReadwiseReaderConfig, ReadwiseSyncFrequency } from '../../../lib/core/import/readwiseReaderSettings';
import type { NativeReadwiseApiConnection, NativeReadwiseApiConnectionResult } from '../../../lib/platform/nativeReadwiseApiConnectionContract';
import type { NativeReadwiseApiScheduleStatus } from '../../../lib/platform/nativeReadwiseApiImportContract';
import { useTranslation, type Translate } from '../../shared/localization/LocalizationProvider';
import {
  connectReadwiseApiFromClipboardInRuntime,
  disconnectReadwiseApiInRuntime,
  loadReadwiseApiConnectionFromRuntime
} from '../../shared/platform/import/readwiseApiConnectionRuntimeRepository';
import { openExternalUrl } from '../../shared/platform/runtimeExternalNavigation';
import { AppButton, SETTINGS_ACTION_BUTTON_WIDTH_CLASS_NAME, SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME, SettingsControlSlot, SettingsRow } from '../../shared/ui';

import { readwiseApiTaskPresentation } from './ReadwiseApiTaskStatus';
import { ReadwiseCommonRows } from './ReadwiseFolderSettingsSections';
import type { ReadwiseManualSyncStatus } from './useReadwiseManualSync';

const READWISE_TOKEN_URL = 'https://readwise.io/access_token';
const IDLE_SYNC_STATUS: ReadwiseManualSyncStatus = {
  failedSources: [],
  message: null,
  tone: 'normal'
};

export interface ReadwiseApiModeSettings {
  cleanupDisabled: boolean;
  config: ReadwiseReaderConfig;
  onChangeFrequency: (value: ReadwiseSyncFrequency) => void;
  onCleanup: () => void;
  onSync: () => void;
  syncDisabled: boolean;
  syncIsRunning: boolean;
  syncStatus: ReadwiseManualSyncStatus;
}

function statusKey(state: NativeReadwiseApiConnection['state']) {
  return {
    connected: 'desktop.readwise.api.status.connected',
    disconnected: 'desktop.readwise.api.status.disconnected',
    reconnect_required: 'desktop.readwise.api.status.reconnectRequired',
    secure_storage_unavailable: 'desktop.readwise.api.status.secureStorageUnavailable'
  }[state] as Parameters<Translate>[0];
}

function resultMessage(result: NativeReadwiseApiConnectionResult, t: Translate) {
  if (result.status === 'rate_limited' && result.retry_after_seconds !== undefined) {
    return t('desktop.readwise.api.result.rateLimitedSeconds', { count: result.retry_after_seconds });
  }
  if (result.status === 'token_missing' || result.status === 'reconnect_required') {
    return t('desktop.readwise.api.result.tokenRequired');
  }
  const keys = {
    account_unverified: 'desktop.readwise.api.result.accountUnverified',
    connection_failed: 'desktop.readwise.api.result.connectionFailed',
    not_active_host: 'desktop.readwise.api.result.notActiveHost',
    rate_limited: 'desktop.readwise.api.result.rateLimited',
    secure_storage_unavailable: 'desktop.readwise.api.result.secureStorageUnavailable',
    source_mode_mismatch: 'desktop.readwise.api.result.sourceModeMismatch'
  } as const;
  const key = keys[result.status as keyof typeof keys];
  return key ? t(key) : null;
}

function useReadwiseApiConnection(t: Translate, onConnected: () => void) {
  const [connection, setConnection] = useState<NativeReadwiseApiConnection | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  useEffect(() => {
    let active = true;
    void loadReadwiseApiConnectionFromRuntime().then((value) => { if (active) setConnection(value); });
    return () => { active = false; };
  }, []);
  async function run(action: () => Promise<NativeReadwiseApiConnectionResult>) {
    setPending(true);
    try {
      const next = await action();
      setConnection(next.connection);
      setMessage(resultMessage(next, t));
      if (next.status === 'connected') onConnected();
    } catch {
      setMessage(t('desktop.readwise.api.result.connectionFailed'));
    } finally {
      setPending(false);
    }
  }
  return { connection, message, pending, run };
}

function ReadwiseApiConnectionRow(props: {
  migration: boolean;
  onConnected: () => void;
}) {
  const t = useTranslation();
  const state = useReadwiseApiConnection(t, props.onConnected);
  if (!state.connection) {
    return (
      <SettingsRow
        description={<><button className="underline decoration-foreground/35 underline-offset-2 hover:decoration-foreground/65 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" onClick={() => void openExternalUrl(READWISE_TOKEN_URL)} type="button">{t('desktop.readwise.api.connection.getToken')}</button>{t('desktop.readwise.api.connection.description')}</>}
        title={t('desktop.readwise.api.connection.title')}
      />
    );
  }
  const connected = state.connection?.state === 'connected';
  const actionLabel = connected
    ? t('desktop.readwise.api.connection.disconnect')
    : t('desktop.readwise.api.connection.connect');
  return (
    <>
      <SettingsRow
        description={<><button className="underline decoration-foreground/35 underline-offset-2 hover:decoration-foreground/65 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" onClick={() => void openExternalUrl(READWISE_TOKEN_URL)} type="button">{t('desktop.readwise.api.connection.getToken')}</button>{t('desktop.readwise.api.connection.description')}</>}
        title={t('desktop.readwise.api.connection.title')}
      >
        <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
          <span className="text-sm text-foreground/60">{t(statusKey(state.connection.state))}</span>
          <AppButton
            className={SETTINGS_ACTION_BUTTON_WIDTH_CLASS_NAME}
            disabled={state.pending}
            loading={state.pending}
            loadingLabel={actionLabel}
            onClick={() => void state.run(connected
              ? disconnectReadwiseApiInRuntime
              : () => connectReadwiseApiFromClipboardInRuntime('continue', props.migration ? 'migration' : 'normal'))}
            size="sm"
            variant={connected ? 'default' : 'emphasis'}
          >
            {actionLabel}
          </AppButton>
        </SettingsControlSlot>
      </SettingsRow>
      {state.message ? <p className="px-5 text-sm text-foreground/60" role="status">{state.message}</p> : null}
    </>
  );
}

export function ReadwiseApiModeSettingsRows(props: {
  migrationActive: boolean;
  migrationMode: boolean;
  onConnected: () => void;
  settings: ReadwiseApiModeSettings;
  taskStatus: NativeReadwiseApiScheduleStatus | null;
}) {
  const t = useTranslation();
  const task = readwiseApiTaskPresentation(props.taskStatus, t);
  const migrationActive = props.migrationActive;
  return (
    <>
      <ReadwiseApiConnectionRow
        migration={props.migrationMode || props.migrationActive}
        onConnected={props.onConnected}
      />
      <ReadwiseCommonRows
        cleanupDisabled={props.settings.cleanupDisabled || migrationActive}
        config={props.settings.config}
        onChange={(_field, value) => props.settings.onChangeFrequency(value as ReadwiseSyncFrequency)}
        onCleanup={props.settings.onCleanup}
        onSync={props.settings.onSync}
        syncActionLabel={task.actionLabel}
        syncDisabled={props.settings.syncDisabled || migrationActive || task.running}
        syncIsRunning={!migrationActive && (props.settings.syncIsRunning || task.running)}
        syncLoadingLabel={task.loadingLabel}
        syncStatus={migrationActive ? IDLE_SYNC_STATUS : props.settings.syncStatus}
      />
    </>
  );
}
