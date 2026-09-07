import { useEffect, useState } from 'react';

import type { ReadwiseSourceMode } from '../../../lib/core/import/importManagerSettings';
import type {
  NativeReadwiseApiConnection,
  NativeReadwiseApiConnectionResult
} from '../../../lib/platform/nativeReadwiseApiConnectionContract';
import { useTranslation, type Translate } from '../../shared/localization/LocalizationProvider';
import {
  connectReadwiseApiFromClipboardInRuntime,
  disconnectReadwiseApiInRuntime,
  loadReadwiseApiConnectionFromRuntime
} from '../../shared/platform/import/readwiseApiConnectionRuntimeRepository';
import {
  AppButton,
  SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME,
  SettingsControlSlot,
  SettingsRow,
  SettingsSection
} from '../../shared/ui';

import { importSourceSelectClassName } from './importSourceWorkspaceModel';
import { ReadwiseIdentityBindingRow } from './ReadwiseIdentityBindingRow';

function statusKey(state: NativeReadwiseApiConnection['state']) {
  const keys = {
    connected: 'desktop.readwise.api.status.connected',
    disconnected: 'desktop.readwise.api.status.disconnected',
    reconnect_required: 'desktop.readwise.api.status.reconnectRequired',
    secure_storage_unavailable: 'desktop.readwise.api.status.secureStorageUnavailable'
  } as const;
  return keys[state];
}

function resultMessage(result: NativeReadwiseApiConnectionResult, t: Translate) {
  if (result.status === 'rate_limited' && result.retry_after_seconds !== undefined) {
    return t('desktop.readwise.api.result.rateLimitedSeconds', { count: result.retry_after_seconds });
  }
  const keys = {
    connection_failed: 'desktop.readwise.api.result.connectionFailed',
    account_unverified: 'desktop.readwise.api.result.accountUnverified',
    not_active_host: 'desktop.readwise.api.result.notActiveHost',
    rate_limited: 'desktop.readwise.api.result.rateLimited',
    reconnect_required: 'desktop.readwise.api.result.reconnectRequired',
    secure_storage_unavailable: 'desktop.readwise.api.result.secureStorageUnavailable',
    source_mode_mismatch: 'desktop.readwise.api.result.sourceModeMismatch',
    token_missing: 'desktop.readwise.api.result.tokenMissing'
  } as const;
  const key = keys[result.status as keyof typeof keys];
  return key ? t(key) : null;
}

function useReadwiseApiConnection(t: Translate) {
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
    } catch {
      setMessage(t('desktop.readwise.api.result.connectionFailed'));
    } finally {
      setPending(false);
    }
  }
  return { connection, message, pending, run };
}

function ReadwiseApiConnectionRow() {
  const t = useTranslation();
  const state = useReadwiseApiConnection(t);
  const connected = state.connection?.state === 'connected';
  const hasSource = state.connection?.has_source ?? false;
  return (
    <>
      <SettingsRow
        description={t('desktop.readwise.api.connection.description')}
        title={t('desktop.readwise.api.connection.title')}
      >
        <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
          <span className="text-sm text-foreground/60">
            {t(statusKey(state.connection?.state ?? 'disconnected'))}
          </span>
          <AppButton
            disabled={state.pending}
            onClick={() => void state.run(connected
              ? disconnectReadwiseApiInRuntime
              : connectReadwiseApiFromClipboardInRuntime)}
            size="sm"
            variant={connected ? 'default' : 'emphasis'}
          >
            {state.pending
              ? t('desktop.readwise.api.connection.working')
              : connected
                ? t('desktop.readwise.api.connection.disconnect')
                : t('desktop.readwise.api.connection.connect')}
          </AppButton>
          {!connected && hasSource ? (
            <AppButton
              disabled={state.pending}
              onClick={() => void state.run(() => connectReadwiseApiFromClipboardInRuntime('replace'))}
              size="sm"
            >
              {t('desktop.readwise.api.connection.replace')}
            </AppButton>
          ) : null}
        </SettingsControlSlot>
      </SettingsRow>
      {state.message ? <p className="px-5 text-sm text-foreground/60" role="status">{state.message}</p> : null}
    </>
  );
}

export function ReadwiseSourceModeSection(props: {
  mode: ReadwiseSourceMode;
  onChange: (mode: ReadwiseSourceMode) => void;
}) {
  const t = useTranslation();
  return (
    <SettingsSection
      ariaLabel={t('desktop.readwise.source.title')}
      description={t('desktop.readwise.source.description')}
      title={t('desktop.readwise.source.title')}
    >
      <SettingsRow description={t('desktop.readwise.source.mode.description')} title={t('desktop.readwise.source.mode.title')}>
        <SettingsControlSlot>
          <select
            aria-label={t('desktop.readwise.source.mode.aria')}
            className={importSourceSelectClassName}
            onChange={(event) => props.onChange(event.target.value === 'api' ? 'api' : 'folder')}
            value={props.mode}
          >
            <option value="folder">{t('desktop.readwise.source.mode.folder')}</option>
            <option value="api">{t('desktop.readwise.source.mode.api')}</option>
          </select>
        </SettingsControlSlot>
      </SettingsRow>
      {props.mode === 'api' ? <><ReadwiseApiConnectionRow /><ReadwiseIdentityBindingRow /></> : null}
    </SettingsSection>
  );
}
