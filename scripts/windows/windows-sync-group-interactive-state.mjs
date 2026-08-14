import path from 'node:path';

import {
  interactiveStatePaths, readJson, writeJsonAtomic
} from './windows-client-native-interactive-state.mjs';
import { WINDOWS_SYNC_FROM_ZERO_PROGRESS } from '../sync-group/sync-from-zero-contract.mjs';

export const WINDOWS_SYNC_GROUP_INTERACTIVE_ACTIONS = new Set([
  'multi-device-sync-a-leave', 'multi-device-sync-a-rejoin', 'multi-device-sync-c',
  'multi-device-sync-from-zero', 'multi-device-sync-participation'
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
  if (request?.schemaVersion !== 1 || !WINDOWS_SYNC_GROUP_INTERACTIVE_ACTIONS.has(request.action)
      || !/^[0-9a-f-]{36}$/u.test(request.nonce || '')
      || !evidenceRoot.startsWith(`${allowedRoot}${path.sep}`)) {
    throw new Error('invalid Sync Group interactive request');
  }
  return { ...request, evidenceRoot };
}

export function validateSyncGroupInteractiveProgress(progress, action) {
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

export { readJson, writeJsonAtomic };
