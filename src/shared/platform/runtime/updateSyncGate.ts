import { APP_SETTINGS_STORAGE_KEYS } from '../../config/appSettings';

import { getWhitelistedLocalStorageItem, setWhitelistedLocalStorageItem } from '../storage';
import {
  SYNC_GATE_PLATFORMS,
  compareVersionStrings,
  type MobileChannels,
  type SyncGatePlatform,
  type UpdateManifest
} from '../updateCheckModel';

export type SyncWaitTarget = SyncGatePlatform | 'all';

export interface SyncWait {
  target: SyncWaitTarget;
  version: string;
}

/**
 * Channels that still lack a build syncing with `version`; empty when the release does not break sync.
 * A channel is ready once it serves `version` or newer with status `available`.
 */
export function resolveSyncGateMissing(
  manifest: UpdateManifest | null,
  channels: MobileChannels | null,
  version: string | undefined
) {
  const release = version ? manifest?.releases.find((item) => item.version === version) : undefined;
  if (!version || !release?.syncBreaking) return [];
  return SYNC_GATE_PLATFORMS.filter((platform) => {
    const channel = channels?.[platform];
    return !(channel?.status === 'available' && compareVersionStrings(channel.version, version) >= 0);
  });
}

export function isSyncWaitSatisfied(target: SyncWaitTarget, missing: readonly SyncGatePlatform[]) {
  return target === 'all' ? missing.length === 0 : !missing.includes(target);
}

/** Wait choices offered for the missing channels: store channels one by one, plus "all" when more than one thing is missing. */
export function listSyncWaitTargets(missing: readonly SyncGatePlatform[]): SyncWaitTarget[] {
  const targets: SyncWaitTarget[] = missing.filter((platform) => platform !== 'apk');
  if (missing.length !== 1 || missing[0] === 'apk') targets.push('all');
  return targets;
}

export function readSyncWait(): SyncWait | null {
  try {
    const raw = JSON.parse(getWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.updateSyncWait) ?? 'null');
    const target = raw?.target;
    const valid = target === 'all' || SYNC_GATE_PLATFORMS.includes(target);
    return valid && typeof raw.version === 'string' ? { target, version: raw.version } : null;
  } catch {
    return null;
  }
}

export function writeSyncWait(wait: SyncWait | null) {
  setWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.updateSyncWait, JSON.stringify(wait));
}
