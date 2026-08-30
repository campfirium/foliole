import { runWindowsDesktopDnsSdRouteControl } from './windows-desktop-dnssd-route-control.mjs';
import {
  WINDOWS_DEFAULT_SYNC_JOURNEY_ACTION,
  runWindowsDefaultSyncJourney
} from './windows-default-sync-journey-action.mjs';

export function runWindowsDevDesktopAction(options) {
  if (options.action === WINDOWS_DEFAULT_SYNC_JOURNEY_ACTION) {
    return runWindowsDefaultSyncJourney({ checked: options.checked,
      evidenceRoot: options.evidenceRoot, execute: options.execute,
      fsApi: options.fsApi, paths: options.paths });
  }
  return runWindowsDesktopDnsSdRouteControl(options);
}
