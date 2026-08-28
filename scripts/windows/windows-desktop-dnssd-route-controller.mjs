import {
  finishWindowsDesktopDnsSdRouteRuntime, prepareWindowsDesktopDnsSdRouteRuntime
} from './windows-desktop-dnssd-route-runtime.mjs';
import {
  runWindowsDesktopDnsSdRouteSelfcheck
} from './windows-desktop-dnssd-route-selfcheck.mjs';

export const WINDOWS_DESKTOP_DNSSD_ROUTE_ACTIONS = new Set([
  'desktop-dnssd-route-provider', 'desktop-dnssd-route-selfcheck'
]);

export async function runWindowsDesktopDnsSdRouteController(options, {
  finishRuntime = finishWindowsDesktopDnsSdRouteRuntime,
  prepareRuntime = prepareWindowsDesktopDnsSdRouteRuntime,
  runSelfcheck = runWindowsDesktopDnsSdRouteSelfcheck
} = {}) {
  if (!WINDOWS_DESKTOP_DNSSD_ROUTE_ACTIONS.has(options.action)) return null;
  const runtime = await prepareRuntime(options);
  let result;
  let primaryError;
  try {
    const runtimeOptions = { ...options, runtimeRepoRoot: runtime.taskCopy.sourceRoot };
    result = options.action === 'desktop-dnssd-route-selfcheck'
      ? await runSelfcheck(runtimeOptions)
      : await options.deviceAction(runtimeOptions);
  } catch (error) {
    primaryError = error;
  }
  const routeRuntime = finishRuntime(runtime, primaryError);
  return { ...result, desktopDnsSdRouteRuntime: {
    receipt: routeRuntime, receiptPath: runtime.receiptPath
  } };
}
