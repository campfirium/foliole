export const ANDROID_EMULATOR_DEFAULT_ENDPOINT = 'http://10.0.2.2:38641';
export const AUTO_SYNC_MIN_INTERVAL_MS = 30_000;

export function shouldRunForegroundAutoSyncCheck(args: {
  force?: boolean;
  isNativeRuntime: boolean;
  lastCheckedAt: number;
  now: number;
}) {
  if (!args.isNativeRuntime) {
    return false;
  }
  if (args.force) {
    return true;
  }
  return args.lastCheckedAt <= 0 || args.now - args.lastCheckedAt >= AUTO_SYNC_MIN_INTERVAL_MS;
}
