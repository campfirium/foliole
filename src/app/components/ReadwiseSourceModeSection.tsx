import { useEffect, useState } from 'react';

import type { ReadwiseSourceMode } from '../../../lib/core/import/importManagerSettings';
import type { NativeReadwiseApiConnection, NativeReadwiseApiConnectionResult } from '../../../lib/platform/nativeReadwiseApiConnectionContract';
import { useTranslation, type Translate } from '../../shared/localization/LocalizationProvider';
import {
  connectReadwiseApiFromClipboardInRuntime,
  disconnectReadwiseApiInRuntime,
  loadReadwiseApiConnectionFromRuntime
} from '../../shared/platform/import/readwiseApiConnectionRuntimeRepository';
import { openExternalUrl } from '../../shared/platform/runtimeExternalNavigation';
import {
  AppButton,
  SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME,
  SettingsControlSlot,
  SettingsRow,
  SettingsSection,
  SettingsSegmentedRow
} from '../../shared/ui';

import { useReadwiseSourceMigration } from './useReadwiseSourceMigration';

const READWISE_TOKEN_URL = 'https://readwise.io/access_token';

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
  migrationPending: boolean;
  migrationPercent: number;
  onConnected: () => void;
}) {
  const t = useTranslation();
  const state = useReadwiseApiConnection(t, props.onConnected);
  const connected = state.connection?.state === 'connected';
  return (
    <>
      <SettingsRow description={t('desktop.readwise.api.connection.description')} title={t('desktop.readwise.api.connection.title')}>
        <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
          <AppButton onClick={() => void openExternalUrl(READWISE_TOKEN_URL)} size="sm" variant="ghost">
            {t('desktop.readwise.api.connection.getToken')}
          </AppButton>
          <span className="text-sm text-foreground/60">{t(statusKey(state.connection?.state ?? 'disconnected'))}</span>
          <AppButton
            disabled={state.pending || props.migrationPending}
            onClick={() => void state.run(connected
              ? disconnectReadwiseApiInRuntime
              : () => connectReadwiseApiFromClipboardInRuntime('continue', props.migration ? 'migration' : 'normal'))}
            size="sm"
            variant={connected ? 'default' : 'emphasis'}
          >
            {props.migrationPending
              ? t('desktop.readwise.cutover.running', { count: props.migrationPercent })
              : state.pending ? t('desktop.readwise.api.connection.working') : connected
                ? t('desktop.readwise.api.connection.disconnect') : t('desktop.readwise.api.connection.connect')}
          </AppButton>
        </SettingsControlSlot>
      </SettingsRow>
      {state.message ? <p className="px-5 text-sm text-foreground/60" role="status">{state.message}</p> : null}
    </>
  );
}

export function ReadwiseSourceModeSection(props: {
  committedMode?: ReadwiseSourceMode;
  mode: ReadwiseSourceMode;
  onChange: (mode: ReadwiseSourceMode) => void;
  onCommitMode?: (mode: ReadwiseSourceMode) => void;
}) {
  const t = useTranslation();
  const committedMode = props.committedMode ?? props.mode;
  const migration = useReadwiseSourceMigration({
    committedMode,
    ...(props.onCommitMode ? { onCommitMode: props.onCommitMode } : {}),
    onSelectApi: () => props.onChange('api'),
    t
  });

  async function chooseMode(mode: ReadwiseSourceMode) {
    if (mode !== 'api' || committedMode === 'api') {
      props.onChange(mode);
      props.onCommitMode?.(mode);
      return;
    }
    await migration.selectApi();
  }

  const migrating = committedMode !== 'api' && props.mode === 'api';
  return (
    <SettingsSection ariaLabel={t('desktop.readwise.source.title')} description={t('desktop.readwise.source.description')} title={t('desktop.readwise.source.title')}>
      <SettingsSegmentedRow
        ariaLabel={t('desktop.readwise.source.mode.aria')}
        description={t('desktop.readwise.source.mode.description')}
        disabled={committedMode === 'api'}
        label={t('desktop.readwise.source.mode.title')}
        onChange={(value) => void chooseMode(value as ReadwiseSourceMode)}
        options={[
          { label: t('desktop.readwise.source.mode.off'), value: 'off' },
          { label: t('desktop.readwise.source.mode.folder'), value: 'folder' },
          { label: t('desktop.readwise.source.mode.api'), value: 'api' }
        ]}
        value={props.mode}
      />
      {props.mode === 'api' ? (
        <ReadwiseApiConnectionRow
          migration={migrating}
          migrationPending={migration.pending}
          migrationPercent={migration.percent}
          onConnected={() => { if (migrating || migration.required) void migration.start(); }}
        />
      ) : null}
    </SettingsSection>
  );
}
