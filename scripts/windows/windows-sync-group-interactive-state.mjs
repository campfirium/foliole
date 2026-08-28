import path from 'node:path';

import {
  interactiveStatePaths, readJson, writeJsonAtomic
} from './windows-client-native-interactive-state.mjs';
import { WINDOWS_SYNC_FROM_ZERO_PROGRESS } from '../sync-group/sync-from-zero-contract.mjs';

export const WINDOWS_SYNC_GROUP_INTERACTIVE_ACTIONS = new Set([
  'desktop-dnssd-route-provider', 'desktop-dnssd-route-selfcheck',
  'multi-device-sync-a-leave', 'multi-device-sync-a-rejoin', 'multi-device-sync-c',
  'multi-device-sync-from-zero', 'multi-device-sync-participation',
  'single-principal-sync-group', 'two-device-sync-provider'
]);
export const WINDOWS_SYNC_GROUP_INTERACTIVE_WORKER_ENV = 'FOLIOLE_SYNC_GROUP_INTERACTIVE_WORKER';
const WINDOWS_A_REJOIN_PROGRESS = [
  'c-native-suspended', 'c-session-opened', 'c-a-b-facts-received',
  'c-fact-created', 'c-three-facts-converged', 'c-session-restarted'
];

export function syncGroupInteractivePaths(repoRoot) {
  const stateRoot = path.join(repoRoot, '.tmp', 'windows-sync-group-interactive');
  return {
    ...interactiveStatePaths(stateRoot),
    providerRelease: path.join(stateRoot, 'provider-release.json')
  };
}

export function validateSyncGroupInteractiveRequest(request, repoRoot, capsulesRoot) {
  const evidenceRoot = path.resolve(String(request?.evidenceRoot ?? ''));
  const allowedRoot = path.resolve(repoRoot, '.tmp', 'artifacts', 'windows-dev-action');
  const runtimeRepoRoot = request?.runtimeRepoRoot
    ? path.resolve(String(request.runtimeRepoRoot)) : null;
  const allowedRuntimeRoot = capsulesRoot ? path.resolve(capsulesRoot) : null;
  const runtimeAllowed = !runtimeRepoRoot || !allowedRuntimeRoot || (allowedRuntimeRoot
    && runtimeRepoRoot.startsWith(`${allowedRuntimeRoot}${path.sep}`)
    && path.basename(runtimeRepoRoot) === 'source');
  const selfcheckAllowed = request?.action === 'desktop-dnssd-route-selfcheck'
    ? ['missing-runtime', 'native-probe'].includes(request.selfcheckMode)
    : request?.selfcheckMode === undefined;
  if (request?.schemaVersion !== 1 || !WINDOWS_SYNC_GROUP_INTERACTIVE_ACTIONS.has(request.action)
      || !/^[0-9a-f-]{36}$/u.test(request.nonce || '')
      || !evidenceRoot.startsWith(`${allowedRoot}${path.sep}`)
      || !runtimeAllowed || !selfcheckAllowed) {
    throw new Error('invalid Sync Group interactive request');
  }
  return { ...request, evidenceRoot, ...(runtimeRepoRoot ? { runtimeRepoRoot } : {}) };
}

export function validateSyncGroupInteractiveProgress(progress, action) {
  if (action === 'desktop-dnssd-route-provider'
      && progress?.milestone === 'route-ready'
      && progress.factId === 'desktop-dnssd-route') {
    return { factId: progress.factId, milestone: progress.milestone };
  }
  if (action === 'single-principal-sync-group'
      && ['requested', 'automatic-converged', 'restarted'].includes(progress?.milestone)
      && progress.factId === 'single-principal-sync-group') {
    return { factId: progress.factId, milestone: progress.milestone };
  }
  if (action === 'two-device-sync-provider'
      && ['provider-ready', 'request-pending', 'accepted', 'automatic-converged', 'restarted']
        .includes(progress?.milestone)
      && progress.factId === 'two-device-sync') {
    return { factId: progress.factId, milestone: progress.milestone };
  }
  if (action === 'multi-device-sync-c' && progress?.milestone === 'c-provider-ready'
      && /^multi-device-sync-c-\d{17}$/u.test(progress.factId || '')) {
    return { factId: progress.factId, milestone: progress.milestone };
  }
  if (action === 'multi-device-sync-a-rejoin'
      && WINDOWS_A_REJOIN_PROGRESS.includes(progress?.milestone)
      && progress.factId === 'a-rejoin') {
    return { factId: progress.factId, milestone: progress.milestone };
  }
  if (action === 'multi-device-sync-from-zero'
      && WINDOWS_SYNC_FROM_ZERO_PROGRESS.includes(progress?.milestone)
      && progress.factId === 'sync-from-zero') {
    return { factId: progress.factId, milestone: progress.milestone };
  }
  if (action === 'multi-device-sync-participation'
      && ['windows-paused', 'macos-departure-observed'].includes(progress?.milestone)
      && progress.factId === 'participation-control') {
    return { factId: progress.factId, milestone: progress.milestone };
  }
  if (action !== 'multi-device-sync-a-leave'
      || progress?.milestone !== 'c-fact-created'
      || !/^multi-device-sync-c-\d{17}$/u.test(progress.factId || '')) {
    throw new Error('invalid Sync Group interactive progress');
  }
  return { factId: progress.factId, milestone: progress.milestone };
}

export function writeSyncGroupInteractiveFatal(paths, error, workerPid) {
  const request = readJson(paths.request);
  const completed = {
    completedAt: new Date().toISOString(),
    error: error instanceof Error ? error.message : String(error),
    exitCode: 1, nonce: request?.nonce, progress: [], schemaVersion: 1,
    state: 'completed', workerPid
  };
  writeJsonAtomic(paths.result, completed);
  writeJsonAtomic(paths.status, completed);
  return completed;
}

export { readJson, writeJsonAtomic };
