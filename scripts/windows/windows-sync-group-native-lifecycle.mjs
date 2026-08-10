import { readReadyState } from './windows-client-native-state.mjs';
import { resolveWindowsNativePaths } from './windows-native-paths.mjs';

export function isWindowsNativeClientRunning(paths) {
  const native = resolveWindowsNativePaths(paths.repoRoot);
  return Boolean(readReadyState({
    appReadyFile: native.appReadyFile,
    bridgeReadyFile: native.bridgeReadyFile,
    windowVisibleFile: native.windowVisibleFile
  }));
}

export async function suspendWindowsNativeClient({
  control, execute, isRunning = isWindowsNativeClientRunning, paths
}) {
  if (!isRunning(paths)) return false;
  await control(execute, paths, 'status');
  await control(execute, paths, 'stop');
  return true;
}

export async function restoreWindowsNativeClient({ control, execute, paths, suspended }) {
  if (suspended) await control(execute, paths, 'start');
}
