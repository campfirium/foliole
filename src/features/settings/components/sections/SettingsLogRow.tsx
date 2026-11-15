import { useEffect, useState } from 'react';

import { NATIVE_COMMANDS } from '../../../../../lib/platform/nativeCommands';
import type { NativeSupportLogAction, NativeSupportLogState } from '../../../../../lib/platform/nativeUtilityContract';
import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import { getRuntimeInvoke } from '../../../../shared/platform/runtimeInvoke';
import {
  AppTooltip, AppTooltipContent, AppTooltipTrigger, SettingsButton, SettingsControlSlot, SettingsRow
} from '../../../../shared/ui';
import { settingsSearchRowProps } from '../../model/settingsSearch';
import { useLocalizedSettingsSearchRow } from '../useLocalizedSettingsSearchRows';

async function runAction(action: NativeSupportLogAction) {
  const invoke = getRuntimeInvoke();
  if (!invoke) throw new Error('Desktop log unavailable');
  const result = await invoke(NATIVE_COMMANDS.desktopSupportLog, { action });
  if (result?.phase === 'idle' || result?.phase === 'ready') return result;
  if (result?.phase === 'recording' && Number.isFinite(result.startedAt)) return result;
  throw new Error('Invalid desktop log state');
}

function formatElapsed(startedAt: number, now: number) {
  const seconds = Math.max(0, Math.floor((now - startedAt) / 1000));
  return [Math.floor(seconds / 60), seconds % 60].map(value => String(value).padStart(2, '0')).join(':');
}

function useSupportLogControls() {
  const [state, setState] = useState<NativeSupportLogState>({ phase: 'idle' });
  const [now, setNow] = useState(Date.now);
  const [busy, setBusy] = useState(true);
  const [failed, setFailed] = useState(false);
  const recording = state.phase === 'recording';

  useEffect(() => {
    let mounted = true;
    void runAction('status').then(next => {
      if (mounted) setState(next);
    }).catch(() => {
      if (mounted) setFailed(true);
    }).finally(() => {
      if (mounted) setBusy(false);
    });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!recording || busy) return;
    let mounted = true;
    let checking = false;
    const timer = setInterval(() => {
      setNow(Date.now());
      if (checking) return;
      checking = true;
      void runAction('status').then(next => {
        if (mounted && next.phase !== 'recording') setState(next);
      }).catch(() => {
        if (mounted) setFailed(true);
      }).finally(() => { checking = false; });
    }, 1000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [recording, busy]);

  async function handleAction(request: NativeSupportLogAction) {
    setFailed(false);
    setBusy(true);
    try {
      setState(await runAction(request));
      setNow(Date.now());
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return { state, now, busy, failed, handleAction };
}

export function SettingsLogRow() {
  const t = useTranslation();
  const row = useLocalizedSettingsSearchRow('about-logs');
  const { state, now, busy, failed, handleAction } = useSupportLogControls();
  const recording = state.phase === 'recording';
  const action = recording ? 'supportLog.stop' : state.phase === 'ready' ? 'supportLog.restart' : 'supportLog.start';

  return (
    <SettingsRow {...settingsSearchRowProps(row)} title={row.title} description={
      <>
        {row.description}
        {failed ? <span className="mt-1 block text-error" role="alert">{t('supportLog.desktopFailed')}</span> : null}
      </>
    }>
      <SettingsControlSlot>
        {recording ? <span aria-label={t('supportLog.elapsed')} className="tabular-nums">
          {formatElapsed(state.startedAt, now)}
        </span> : null}
        <AppTooltip>
          <AppTooltipTrigger asChild>
            <SettingsButton disabled={busy} onClick={() => void handleAction(recording ? 'stop' : 'start')}>
              {t(action)}
            </SettingsButton>
          </AppTooltipTrigger>
          {recording ? null : <AppTooltipContent layer="dropdown" side="top">
            {t('supportLog.startTooltip')}
          </AppTooltipContent>}
        </AppTooltip>
        {state.phase === 'ready' ? <SettingsButton disabled={busy} onClick={() => void handleAction('reveal')}>
          {t('supportLog.open')}
        </SettingsButton> : null}
      </SettingsControlSlot>
    </SettingsRow>
  );
}
