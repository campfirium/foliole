import type { NativeCompanionWorkspaceSyncState } from '../../lib/platform/nativeCompanionSyncContract';

export const ANDROID_EMULATOR_DEFAULT_ENDPOINT = 'http://10.0.2.2:38641';
export const AUTO_SYNC_MIN_INTERVAL_MS = 30_000;

export function shouldAutoPullInitialDesktopSnapshot(args: {
  isNativeRuntime: boolean;
  state: NativeCompanionWorkspaceSyncState;
}) {
  void args;
  return false;
}

export function shouldPullUpdatedDesktopSnapshot(args: {
  lastSyncedAt: string | null;
  remoteExportedAt: string;
}) {
  if (!args.lastSyncedAt) {
    return true;
  }
  return args.remoteExportedAt > args.lastSyncedAt;
}

export function shouldRunForegroundAutoSyncCheck(args: {
  isNativeRuntime: boolean;
  lastCheckedAt: number;
  now: number;
}) {
  void args;
  return false;
}
