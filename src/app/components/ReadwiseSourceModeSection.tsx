import { useEffect, useState } from 'react';

import type { ReadwiseSourceMode } from '../../../lib/core/import/importManagerSettings';
import type { NativeReadwiseApiConnection, NativeReadwiseApiConnectionResult } from '../../../lib/platform/nativeReadwiseApiConnectionContract';
import { useTranslation, type Translate } from '../../shared/localization/LocalizationProvider';
import {
  connectReadwiseApiFromClipboardInRuntime,
  disconnectReadwiseApiInRuntime,
  loadReadwiseApiConnectionFromRuntime
} from '../../shared/platform/import/readwiseApiConnectionRuntimeRepository';
import {
  previewReadwiseSourceCutoverInRuntime,
  runReadwiseSourceCutoverInRuntime
} from '../../shared/platform/import/readwiseSourceCutoverRuntimeRepository';
import { openExternalUrl } from '../../shared/platform/runtimeExternalNavigation';
import {
  AppButton,
  requestAppConfirmation,
  SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME,
  SettingsControlSlot,
  SettingsRow,
  SettingsSection,
  SettingsSegmentedRow
} from '../../shared/ui';

const READWISE_TOKEN_URL = 'https://readwise.io/access_token';

function statusKey(state: NativeReadwiseApiConnection['state']) {
  const keys = {
    connected: 'desktop.readwise.api.status.connected',
    disconnected: 'desktop.readwise.api.status.disconnected',
    reconnect_required: 'desktop.readwise.api.status.reconnectRequired',
    secure_storage_unavailable: 'desktop.readwise.api.status.secureStorageUnavailable'
  } as const;
  return keys[state];
}

function cutoverResultKey(status: string) {
  const keys = {
    already_completed: 'desktop.readwise.cutover.result.already_completed',
    connection_required: 'desktop.readwise.cutover.result.connection_required',
    failed: 'desktop.readwise.cutover.result.failed',
    not_active_host: 'desktop.readwise.cutover.result.not_active_host',
    source_unavailable: 'desktop.readwise.cutover.result.source_unavailable'
  } as const;
  return keys[status as keyof typeof keys] ?? keys.failed;
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

function ReadwiseApiConnectionRow({ migration }: { migration: boolean }) {
  const t = useTranslation();
  const state = useReadwiseApiConnection(t);
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
            disabled={state.pending}
            onClick={() => void state.run(connected
              ? disconnectReadwiseApiInRuntime
              : () => connectReadwiseApiFromClipboardInRuntime('continue', migration ? 'migration' : 'normal'))}
            size="sm"
            variant={connected ? 'default' : 'emphasis'}
          >
            {state.pending ? t('desktop.readwise.api.connection.working') : connected
              ? t('desktop.readwise.api.connection.disconnect') : t('desktop.readwise.api.connection.connect')}
          </AppButton>
        </SettingsControlSlot>
      </SettingsRow>
      {state.message ? <p className="px-5 text-sm text-foreground/60" role="status">{state.message}</p> : null}
    </>
  );
}

function ReadwiseCutoverRow(props: { onCompleted: () => void }) {
  const t = useTranslation();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  async function run() {
    setPending(true);
    try {
      const preview = await previewReadwiseSourceCutoverInRuntime();
      if (preview.status !== 'ready') {
        setMessage(t(cutoverResultKey(preview.status)));
        return;
      }
      const confirmed = await requestAppConfirmation({
        cancelLabel: t('shared.confirm.cancel'),
        confirmLabel: t('desktop.readwise.cutover.confirm'),
        description: [
          t('desktop.readwise.cutover.count', { count: preview.topic_count }),
          t('desktop.readwise.cutover.effect'),
          t('desktop.readwise.cutover.experimental')
        ],
        title: t('desktop.readwise.cutover.title')
      });
      if (!confirmed) return;
      const result = await runReadwiseSourceCutoverInRuntime();
      if (result.status === 'completed' || result.status === 'already_completed') {
        props.onCompleted();
        setMessage(t('desktop.readwise.cutover.result.completed', {
          count: result.migrated_count,
          unmatched: result.unmatched_count
        }));
      } else {
        setMessage(t(cutoverResultKey(result.status)));
      }
    } catch {
      setMessage(t('desktop.readwise.cutover.result.failed'));
    } finally {
      setPending(false);
    }
  }
  return (
    <>
      <SettingsRow description={t('desktop.readwise.cutover.description')} title={t('desktop.readwise.cutover.actionTitle')}>
        <SettingsControlSlot>
          <AppButton loading={pending} onClick={() => void run()} size="sm" variant="emphasis">
            {t(pending ? 'desktop.readwise.cutover.running' : 'desktop.readwise.cutover.action')}
          </AppButton>
        </SettingsControlSlot>
      </SettingsRow>
      {message ? <p className="px-5 text-sm text-foreground/60" role="status">{message}</p> : null}
    </>
  );
}

export function ReadwiseSourceModeSection(props: {
  committedMode?: ReadwiseSourceMode;
  mode: ReadwiseSourceMode;
  onChange: (mode: ReadwiseSourceMode) => void;
  onCutoverCompleted?: () => void;
}) {
  const t = useTranslation();
  const committedMode = props.committedMode ?? props.mode;
  const migrating = committedMode === 'folder' && props.mode === 'api';
  return (
    <SettingsSection ariaLabel={t('desktop.readwise.source.title')} description={t('desktop.readwise.source.description')} title={t('desktop.readwise.source.title')}>
      <SettingsSegmentedRow
        ariaLabel={t('desktop.readwise.source.mode.aria')}
        description={t('desktop.readwise.source.mode.description')}
        disabled={committedMode === 'api'}
        label={t('desktop.readwise.source.mode.title')}
        onChange={(value) => props.onChange(value === 'api' ? 'api' : 'folder')}
        options={[
          { label: t('desktop.readwise.source.mode.api'), value: 'api' },
          { label: t('desktop.readwise.source.mode.folder'), value: 'folder' }
        ]}
        value={props.mode}
      />
      {props.mode === 'api' ? <ReadwiseApiConnectionRow migration={migrating} /> : null}
      {migrating ? <ReadwiseCutoverRow onCompleted={props.onCutoverCompleted ?? (() => undefined)} /> : null}
    </SettingsSection>
  );
}
