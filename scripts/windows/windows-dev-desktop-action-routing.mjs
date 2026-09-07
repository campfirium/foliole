import { runWindowsDesktopDnsSdRouteControl } from './windows-desktop-dnssd-route-control.mjs';
import {
  WINDOWS_DEFAULT_SYNC_JOURNEY_ACTION,
  runWindowsDefaultSyncJourney
} from './windows-default-sync-journey-action.mjs';
import { runWindowsReadwiseApiConnectionAcceptance } from './windows-readwise-api-connection-action.mjs';
import { runWindowsReadwiseApiExternalAcceptance } from './windows-readwise-api-external-action.mjs';
import { runWindowsReadwiseApiImportAcceptance } from './windows-readwise-api-import-action.mjs';
import { runWindowsReadwiseApiReconcileAcceptance } from './windows-readwise-api-reconcile-action.mjs';

export function runWindowsDevDesktopAction(options) {
  if (options.action === WINDOWS_DEFAULT_SYNC_JOURNEY_ACTION) {
    return runWindowsDefaultSyncJourney({ checked: options.checked,
      evidenceRoot: options.evidenceRoot, execute: options.execute,
      fsApi: options.fsApi, paths: options.paths });
  }
  if (options.action === 'readwise-api-connection') {
    return runWindowsReadwiseApiConnectionAcceptance(
      options.action, options.execute, options.paths
    );
  }
  if (options.action === 'readwise-api-import') {
    return runWindowsReadwiseApiImportAcceptance(options.action, options.execute, options.paths);
  }
  if (options.action === 'readwise-api-external') {
    return runWindowsReadwiseApiExternalAcceptance(options.action, options.execute, options.paths);
  }
  if (options.action === 'readwise-api-reconcile') {
    return runWindowsReadwiseApiReconcileAcceptance(options.action, options.execute, options.paths);
  }
  return runWindowsDesktopDnsSdRouteControl(options);
}
