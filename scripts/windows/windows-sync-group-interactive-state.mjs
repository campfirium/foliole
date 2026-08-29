import path from 'node:path';

import {
  interactiveStatePaths, readJson, writeJsonAtomic
} from './windows-client-native-interactive-state.mjs';
import { WINDOWS_SYNC_FROM_ZERO_PROGRESS } from '../sync-group/sync-from-zero-contract.mjs';

export const WINDOWS_SYNC_GROUP_INTERACTIVE_ACTIONS = new Set([
  'desktop-dnssd-advertise-acceptance', 'desktop-dnssd-find-acceptance',
  'desktop-dnssd-find-diagnostic',
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

export function validateSyncGroupInteractiveRequest(request, repoRoot) {
  const evidenceRoot = path.resolve(String(request?.evidenceRoot ?? ''));
  const allowedRoot = path.resolve(repoRoot, '.tmp', 'artifacts', 'windows-dev-action');
  const selfcheckAllowed = request?.action === 'desktop-dnssd-route-selfcheck'
    ? ['missing-runtime', 'product-launch'].includes(request.selfcheckMode)
    : request?.selfcheckMode === undefined;
  if (request?.schemaVersion !== 1 || !WINDOWS_SYNC_GROUP_INTERACTIVE_ACTIONS.has(request.action)
      || !/^[0-9a-f-]{36}$/u.test(request.nonce || '')
      || !evidenceRoot.startsWith(`${allowedRoot}${path.sep}`)
      || !selfcheckAllowed) {
    throw new Error('invalid Sync Group interactive request');
  }
  const expectedAllowed = ['desktop-dnssd-find-acceptance', 'desktop-dnssd-find-diagnostic',
    'single-principal-sync-group']
    .includes(request.action)
    ? /^group-[0-9a-f-]{36}$/u.test(request.expectedGroupId ?? '')
      && /^[0-9a-f]{32}$/u.test(request.expectedGroupTag ?? '')
    : request.expectedGroupId === undefined && request.expectedGroupTag === undefined;
  if (!expectedAllowed) throw new Error('invalid Sync Group interactive request');
  return { ...request, evidenceRoot };
}

export function validateSyncGroupInteractiveProgress(progress, action) {
  if (['desktop-dnssd-find-acceptance', 'desktop-dnssd-find-diagnostic'].includes(action)
      && progress?.milestone === 'candidate-found'
      && progress.factId === action) {
    return { factId: progress.factId, milestone: progress.milestone };
  }
  if (action === 'desktop-dnssd-advertise-acceptance'
      && progress?.milestone === 'provider-ready'
      && progress.factId === action
      && /^group-[0-9a-f-]{36}$/u.test(progress.groupId ?? '')
      && /^[0-9a-f]{32}$/u.test(progress.groupTag ?? '')) {
    return { factId: progress.factId, groupId: progress.groupId,
      groupTag: progress.groupTag, milestone: progress.milestone };
  }
  if (action === 'desktop-dnssd-route-provider'
      && ((progress?.milestone === 'fixture-ready'
          && /^[0-9a-f]{64}$/u.test(progress.factId || ''))
        || (progress?.milestone === 'route-ready'
          && progress.factId === 'desktop-dnssd-route'))) {
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
    if (progress.milestone === 'provider-ready'
        && (!/^group-[0-9a-f-]{36}$/u.test(progress.groupId ?? '')
          || !/^[0-9a-f]{32}$/u.test(progress.groupTag ?? ''))) {
      throw new Error('invalid Sync Group interactive progress');
    }
    if (progress.milestone !== 'provider-ready'
        && (progress.groupId !== undefined || progress.groupTag !== undefined)) {
      throw new Error('invalid Sync Group interactive progress');
    }
    return { factId: progress.factId, milestone: progress.milestone,
      ...(progress.groupId ? { groupId: progress.groupId, groupTag: progress.groupTag } : {}) };
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
