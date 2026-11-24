import { useEffect, useState } from 'react';

import { useTranslation } from '../localization/LocalizationProvider';
import { installDesktopUpdate, readDesktopUpdateState } from '../platform/desktopUpdate';
import { readUpdateCheckState, refreshCachedUpdateManifest, subscribeUpdateCheckState } from '../platform/updateCheck';
import type { SyncGatePlatform } from '../platform/updateCheckModel';
import {
  isSyncWaitSatisfied,
  listSyncWaitTargets,
  readSyncWait,
  resolveSyncGateMissing,
  writeSyncWait,
  type SyncWait,
  type SyncWaitTarget
} from '../platform/runtime/updateSyncGate';

import { requestAppChoice } from './appChoice';
import { requestAppConfirmation } from './appConfirmation';

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

function resolveGateMissing(version: string | undefined) {
  const { cachedManifest, cachedMobileChannels } = readUpdateCheckState();
  return resolveSyncGateMissing(cachedManifest, cachedMobileChannels ?? null, version);
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

const waitListeners = new Set<(wait: SyncWait | null) => void>();

function updateWait(wait: SyncWait | null) {
  writeSyncWait(wait);
  waitListeners.forEach((listener) => listener(wait));
}

function isReadyVersion(version: string | undefined): version is string {
  const state = readDesktopUpdateState();
  return Boolean(version) && state.phase === 'ready' && state.version === version;
}

async function requestInstall(t: Translate, version: string | undefined) {
  if (!isReadyVersion(version)) return;
  if (resolveGateMissing(version).length) await refreshCachedUpdateManifest();
  if (!isReadyVersion(version)) return;
  const missing = resolveGateMissing(version);
  if (!missing.length) {
    void installDesktopUpdate(version);
    return;
  }
  const targets = listSyncWaitTargets(missing);
  const choice = await requestAppChoice({
    choices: [
      ...targets.map((target) => ({
        label: target === 'all'
          ? t('desktop.workspace.syncGate.waitAll')
          : t('desktop.workspace.syncGate.waitPlatform', { platform: SYNC_GATE_PLATFORM_LABELS[target] }),
        value: target
      })),
      { label: t('desktop.workspace.syncGate.installAnyway'), tone: 'danger' as const, value: INSTALL_ANYWAY_VALUE }
    ],
    description: describeMissing(t, missing),
    title: t('desktop.workspace.syncGate.title')
  });
  if (!isReadyVersion(version)) return;
  if (choice === INSTALL_ANYWAY_VALUE) {
    void installDesktopUpdate(version);
  } else {
    const target = targets.find((value) => value === choice);
    if (target) updateWait({ target, version });
  }
}

export function useDesktopUpdateSyncGate(version: string | undefined, ready: boolean) {
  const t = useTranslation();
  const [, setRevision] = useState(0);
  const [wait, setWait] = useState<SyncWait | null>(readSyncWait);
  useEffect(() => subscribeUpdateCheckState(() => setRevision((value) => value + 1)), []);
  useEffect(() => {
    waitListeners.add(setWait);
    setWait(readSyncWait());
    return () => { waitListeners.delete(setWait); };
  }, []);

  const missing = resolveGateMissing(version);
  const activeWait = wait && wait.version === version ? wait : null;
  useEffect(() => {
    if (!ready || !activeWait || !isReadyVersion(version) || !isSyncWaitSatisfied(activeWait.target, missing)) return;
    const currentWait = readSyncWait();
    if (currentWait?.version !== version || currentWait.target !== activeWait.target) return;
    updateWait(null);
    void promptWaitReady(t, activeWait.target).then((confirmed) => {
      if (confirmed && isReadyVersion(version)) void installDesktopUpdate(version);
    });
  });

  return {
    dim: missing.length > 0,
    hidden: Boolean(activeWait && !isSyncWaitSatisfied(activeWait.target, missing)),
    onInstallClick: () => requestInstall(t, version)
  };
}
