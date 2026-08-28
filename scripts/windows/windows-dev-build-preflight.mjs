import { WINDOWS_DESKTOP_DNSSD_ROUTE_ACTIONS } from
  './windows-desktop-dnssd-route-controller.mjs';
import {
  isWindowsSyncGroupAction, preparesWindowsSyncGroupCandidate
} from './windows-sync-group-build-routing.mjs';

const DESKTOP_SYNC_GROUP_BUILD_ACTIONS = new Set([
  'single-principal-sync-group', 'two-device-sync-provider'
]);

export function requiresWindowsDevDesktopBuild(action) {
  return ['device-profile', 'sync-group-join-prepare'].includes(action)
    || DESKTOP_SYNC_GROUP_BUILD_ACTIONS.has(action)
    || preparesWindowsSyncGroupCandidate(action);
}

export function windowsDevRequiredTools(action, paths) {
  const npmRequired = ['build', 'capture-annotation', 'deploy'].includes(action)
    || requiresWindowsDevDesktopBuild(action)
    || WINDOWS_DESKTOP_DNSSD_ROUTE_ACTIONS.has(action)
    || action === 'frozen-revision-preflight';
  const archiveTools = action === 'frozen-revision-preflight'
    || WINDOWS_DESKTOP_DNSSD_ROUTE_ACTIONS.has(action);
  const adbRequired = !['build', 'device-profile', 'frozen-revision-preflight',
    'sync-group-join-prepare'].includes(action) && !isWindowsSyncGroupAction(action);
  return [paths.systemNode, ...(npmRequired ? [paths.systemNpmCli] : []),
    ...(archiveTools ? [paths.gitPath, paths.tarPath] : []),
    ...(adbRequired ? [paths.adbPath] : [])];
}
