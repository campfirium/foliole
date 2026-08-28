import {
  assertWindowsDesktopDnsSdFixedRuntime, prepareWindowsDesktopDnsSdFixedRuntime
} from './windows-desktop-dnssd-fixed-runtime.mjs';
import { runWindowsDesktopDnsSdRouteSelfcheck } from
  './windows-desktop-dnssd-route-selfcheck.mjs';
import { controlWindowsNativeClient } from './windows-sync-group-recovery-action.mjs';
import {
  restoreWindowsNativeClient, suspendWindowsNativeClient
} from './windows-sync-group-native-lifecycle.mjs';

export const WINDOWS_DESKTOP_DNSSD_ROUTE_ACTIONS = new Set([
  'desktop-dnssd-route-prepare', 'desktop-dnssd-route-provider',
  'desktop-dnssd-route-selfcheck'
]);

function occupiedRuntimeError(residual) {
  return Object.assign(new Error(
    `Windows fixed runtime remains occupied by ${residual.length} process(es).`
  ), { exitCode: 73, stage: 'runtime-occupied' });
}

export async function runWindowsDesktopDnsSdRouteControl(options, {
  assertPrepared = assertWindowsDesktopDnsSdFixedRuntime,
  control = controlWindowsNativeClient,
  prepare = prepareWindowsDesktopDnsSdFixedRuntime,
  restore = restoreWindowsNativeClient,
  runSelfcheck = runWindowsDesktopDnsSdRouteSelfcheck,
  suspend = suspendWindowsNativeClient
} = {}) {
  if (!WINDOWS_DESKTOP_DNSSD_ROUTE_ACTIONS.has(options.action)) return null;
  const suspended = await suspend({ control, execute: options.execute, paths: options.paths });
  let result;
  let primaryError;
  try {
    const residual = await options.snapshotRuntime();
    if (residual.length > 0) throw occupiedRuntimeError(residual);
    if (options.action === 'desktop-dnssd-route-prepare') result = await prepare(options);
    else {
      await assertPrepared(options);
      result = options.action === 'desktop-dnssd-route-selfcheck'
        ? await runSelfcheck(options) : await options.deviceAction(options);
    }
  } catch (error) {
    primaryError = error;
  }
  try {
    await restore({ control, execute: options.execute, paths: options.paths, suspended });
  } catch (error) {
    if (!primaryError) primaryError = Object.assign(error, { stage: 'runtime-restore' });
  }
  if (primaryError) throw primaryError;
  return result;
}
