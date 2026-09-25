import { useCallback, useEffect, useRef, useState } from 'react';

import type { NativeReadwiseJoinDecision } from '../../../lib/platform/nativeReadwiseHostContract';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { onDesktopSyncGroupOverviewChanged } from '../../shared/platform/desktopSyncGroupRuntimeRepository';
import {
  loadReadwiseHostAssignmentFromRuntime,
  resolveReadwiseJoinDecisionInRuntime,
  selectReadwiseImportDeviceInRuntime
} from '../../shared/platform/import/readwiseHostAssignmentRuntimeRepository';
import { isDesktopRuntime } from '../../shared/platform/runtime';
import { AppButton, AppDialog, AppDialogActions, AppDialogBody,
  AppDialogContent, AppDialogOverlay, AppDialogPortal, AppDialogTitle } from '../../shared/ui';

function useReadwiseJoinDecision() {
  const [decision, setDecision] = useState<NativeReadwiseJoinDecision | null>(null);
  const [pending, setPending] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [error, setError] = useState(false);
  const loading = useRef(false);
  const selected = useRef<string | null>(null);
  const refresh = useCallback(async () => {
    if (loading.current || !isDesktopRuntime()) return;
    loading.current = true;
    try {
      if (selected.current) {
        const assignment = await loadReadwiseHostAssignmentFromRuntime();
        if (assignment?.active_device_identity_key) {
          selected.current = null;
          setDecision({ kind: 'none', devices: [] });
          setDismissed(false);
        }
        return;
      }
      const next = await resolveReadwiseJoinDecisionInRuntime();
      if (next?.kind === 'none') {
        setDismissed(false);
      }
      setDecision(next);
    } catch { setError(true); }
    finally { loading.current = false; }
  }, []);
  useEffect(() => {
    void refresh();
    return onDesktopSyncGroupOverviewChanged(() => { void refresh(); }) ?? undefined;
  }, [refresh]);

  const choose = async (deviceId: string) => {
    setPending(true);
    setError(false);
    selected.current = deviceId;
    setDecision({ kind: 'switching', devices: [] });
    try {
      await selectReadwiseImportDeviceInRuntime(deviceId);
      await refresh();
    } catch {
      selected.current = null;
      setError(true);
      setDecision(decision);
    } finally { setPending(false); }
  };
  return { choose, decision, dismissed, error, pending, setDismissed };
}

export function ReadwiseImportDeviceDialog() {
  const t = useTranslation();
  const { choose, decision, dismissed, error, pending, setDismissed } = useReadwiseJoinDecision();
  if (!decision || decision.kind === 'none' || dismissed) return null;
  return (
    <AppDialog open>
      <AppDialogPortal>
        <AppDialogOverlay />
        <AppDialogContent aria-describedby={undefined}
          className="w-[min(460px,calc(100vw-48px))]" layout="task"
          onEscapeKeyDown={(event) => event.preventDefault()}
          onPointerDownOutside={(event) => event.preventDefault()}>
          <AppDialogTitle>{t('desktop.readwise.join.title')}</AppDialogTitle>
          <AppDialogBody className="space-y-3">
            <p className="text-sm text-foreground/65">
              {decision.kind === 'choose' ? t('desktop.readwise.join.choose')
                : decision.kind === 'switching' ? t('desktop.readwise.host.switchingDescription')
                  : t('desktop.readwise.join.waiting')}
            </p>
            {error ? <p className="text-sm text-error" role="alert">
              {t('desktop.readwise.host.retry')}
            </p> : null}
          </AppDialogBody>
          <AppDialogActions>
            <AppButton disabled={pending} onClick={() => setDismissed(true)}>
              {t('desktop.readwise.join.later')}
            </AppButton>
            {decision.kind === 'choose' ? decision.devices.map((device) => (
              <AppButton disabled={pending} key={device.device_id}
                onClick={() => void choose(device.device_id)} variant="emphasis">
                {device.device_name}
              </AppButton>
            )) : null}
          </AppDialogActions>
        </AppDialogContent>
      </AppDialogPortal>
    </AppDialog>
  );
}
