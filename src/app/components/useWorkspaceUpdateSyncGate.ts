import { useEffect, useRef, useState } from 'react';

import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { installDesktopUpdate } from '../../shared/platform/desktopUpdate';
import { readUpdateCheckState, refreshCachedUpdateManifest, subscribeUpdateCheckState } from '../../shared/platform/updateCheck';
import type { SyncGatePlatform } from '../../shared/platform/updateCheckModel';
import {
  isSyncWaitSatisfied,
  listSyncWaitTargets,
  readSyncWait,
  resolveSyncGateMissing,
  writeSyncWait,
  type SyncWait,
  type SyncWaitTarget
} from '../../shared/platform/updateSyncGate';
import { requestAppChoice } from '../../shared/ui/appChoice';
import { requestAppConfirmation } from '../../shared/ui/appConfirmation';

const SYNC_GATE_PLATFORM_LABELS: Record<SyncGatePlatform, string> = {
  apk: 'Android APK',
  googlePlay: 'Google Play',
  ios: 'iOS'
};
const INSTALL_ANYWAY_VALUE = 'install';

type Translate = ReturnType<typeof useTranslation>;

function joinPlatforms(t: Translate, platforms: readonly SyncGatePlatform[]) {
  const labels = platforms.map((platform) => SYNC_GATE_PLATFORM_LABELS[platform]);
  const last = labels.pop();
  if (!labels.length) return last ?? '';
  const first = labels.join(t('desktop.workspace.syncGate.listSeparator'));
  return t('desktop.workspace.syncGate.listPair', { first, second: last ?? '' });
}

function describeMissing(t: Translate, missing: readonly SyncGatePlatform[]) {
  const ready = (['ios', 'googlePlay', 'apk'] as const).filter((platform) => !missing.includes(platform));
  const pending = joinPlatforms(t, missing);
  const status = ready.length
    ? t('desktop.workspace.syncGate.pendingReady', { pending, ready: joinPlatforms(t, ready) })
    : t('desktop.workspace.syncGate.pendingOnly', { pending });
  return `${t('desktop.workspace.syncGate.intro')}${status}`;
}

function promptWaitReady(t: Translate, target: SyncWaitTarget) {
  return requestAppConfirmation({
    cancelLabel: t('desktop.workspace.syncGate.later'),
    confirmLabel: t('desktop.workspace.syncGate.install'),
    description: target === 'all'
      ? t('desktop.workspace.syncGate.allReady')
      : t('desktop.workspace.syncGate.platformReady', { platform: SYNC_GATE_PLATFORM_LABELS[target] }),
    title: t('desktop.workspace.syncGate.title')
  });
}

/** Gates the install button on whether the mobile channels already serve a build that syncs with this release. */
export function useWorkspaceUpdateSyncGate(version: string | undefined, ready: boolean) {
  const t = useTranslation();
  const [, setRevision] = useState(0);
  const [wait, setWait] = useState<SyncWait | null>(readSyncWait);
  const promptedRef = useRef<string | null>(null);
  useEffect(() => subscribeUpdateCheckState(() => setRevision((value) => value + 1)), []);
  const missing = resolveSyncGateMissing(readUpdateCheckState().cachedManifest, version);
  const activeWait = wait && wait.version === version ? wait : null;
  const updateWait = (next: SyncWait | null) => {
    writeSyncWait(next);
    setWait(next);
  };

  useEffect(() => {
    if (!ready || !activeWait || !isSyncWaitSatisfied(activeWait.target, missing)) return;
    const key = `${activeWait.version}:${activeWait.target}`;
    if (promptedRef.current === key) return;
    promptedRef.current = key;
    updateWait(null);
    void promptWaitReady(t, activeWait.target).then((confirmed) => {
      if (confirmed) void installDesktopUpdate();
    });
  });

  async function onInstallClick() {
    if (!missing.length) {
      void installDesktopUpdate();
      return;
    }
    await refreshCachedUpdateManifest();
    const stillMissing = resolveSyncGateMissing(readUpdateCheckState().cachedManifest, version);
    if (!stillMissing.length) {
      void installDesktopUpdate();
      return;
    }
    const choice = await requestAppChoice({
      choices: [
        ...listSyncWaitTargets(stillMissing).map((target) => ({
          label: target === 'all'
            ? t('desktop.workspace.syncGate.waitAll')
            : t('desktop.workspace.syncGate.waitPlatform', { platform: SYNC_GATE_PLATFORM_LABELS[target] }),
          value: target
        })),
        { label: t('desktop.workspace.syncGate.installAnyway'), tone: 'danger' as const, value: INSTALL_ANYWAY_VALUE }
      ],
      description: describeMissing(t, stillMissing),
      title: t('desktop.workspace.syncGate.title')
    });
    if (choice === INSTALL_ANYWAY_VALUE) {
      void installDesktopUpdate();
    } else if (choice && version) {
      promptedRef.current = null;
      updateWait({ target: choice as SyncWaitTarget, version });
    }
  }

  const hidden = Boolean(activeWait) && !isSyncWaitSatisfied(activeWait?.target ?? 'all', missing);
  return { dim: missing.length > 0, hidden, onInstallClick };
}
