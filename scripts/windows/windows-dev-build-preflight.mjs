import { WINDOWS_DESKTOP_DNSSD_ROUTE_ACTIONS } from
  './windows-desktop-dnssd-route-control.mjs';
import {
  isWindowsSyncGroupAction, preparesWindowsSyncGroupCandidate
} from './windows-sync-group-build-routing.mjs';

export const WINDOWS_ORDINARY_JOURNEY_BRANCH = 'sync';

function comparablePath(value) {
  return value.replaceAll('\\', '/').replace(/\/+$/u, '').toLowerCase();
}

export async function verifyWindowsOrdinaryJourneyCheckout({ action, checked, execute, paths }) {
  if (action !== 'default-sync-journey') return;
  const expectedRoot = paths.ordinaryJourneyRepoRoot;
  if (!expectedRoot || comparablePath(paths.repoRoot) !== comparablePath(expectedRoot)) {
    throw new Error(`Windows ordinary journey requires ${expectedRoot ?? 'its dedicated checkout'}.`);
  }
  const options = { cwd: paths.repoRoot, timeoutCode: 'journey_checkout_timeout',
    timeoutMs: 30_000, windowsHide: true };
  const top = await checked(execute, paths.gitPath,
    ['-C', paths.repoRoot, 'rev-parse', '--show-toplevel'], options, 'journey-checkout');
  if (comparablePath(top.stdout.trim()) !== comparablePath(paths.repoRoot)) {
    throw new Error('Windows ordinary journey resolved a different checkout root.');
  }
  const branch = await checked(execute, paths.gitPath,
    ['-C', paths.repoRoot, 'branch', '--show-current'], options, 'journey-checkout');
  if (branch.stdout.trim() !== WINDOWS_ORDINARY_JOURNEY_BRANCH) {
    throw new Error(`Windows ordinary journey requires branch ${WINDOWS_ORDINARY_JOURNEY_BRANCH}.`);
  }
  const status = await checked(execute, paths.gitPath,
    ['-C', paths.repoRoot, 'status', '--short'], options, 'journey-checkout');
  if (status.stdout.trim()) throw new Error('Windows ordinary journey requires a clean checkout.');
}

const DESKTOP_SYNC_GROUP_BUILD_ACTIONS = new Set([
  'default-sync-journey', 'single-principal-sync-group', 'two-device-sync-provider'
]);

export function requiresWindowsDevDesktopBuild(action) {
  return ['device-profile', 'sync-group-join-prepare'].includes(action)
    || DESKTOP_SYNC_GROUP_BUILD_ACTIONS.has(action)
    || preparesWindowsSyncGroupCandidate(action);
}

export function windowsDevRequiredTools(action, paths) {
  const npmRequired = ['build', 'capture-annotation', 'deploy'].includes(action)
    || requiresWindowsDevDesktopBuild(action)
    || action === 'desktop-dnssd-route-prepare'
    || action === 'frozen-revision-preflight';
  const gitRequired = ['default-sync-journey', 'frozen-revision-preflight'].includes(action)
    || WINDOWS_DESKTOP_DNSSD_ROUTE_ACTIONS.has(action);
  const tarRequired = action === 'frozen-revision-preflight';
  const adbRequired = !['build', 'default-sync-journey', 'desktop-dnssd-host-facts',
    'device-profile', 'frozen-revision-preflight', 'sync-group-join-prepare'].includes(action)
    && !isWindowsSyncGroupAction(action);
  return [paths.systemNode, ...(npmRequired ? [paths.systemNpmCli] : []),
    ...(gitRequired ? [paths.gitPath] : []),
    ...(tarRequired ? [paths.tarPath] : []),
    ...(adbRequired ? [paths.adbPath] : [])];
}
