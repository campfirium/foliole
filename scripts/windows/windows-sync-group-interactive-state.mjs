import path from 'node:path';

import {
  interactiveStatePaths, readJson, writeJsonAtomic
} from './windows-client-native-interactive-state.mjs';

export const WINDOWS_SYNC_GROUP_INTERACTIVE_ACTIONS = new Set([
  'multi-device-sync-a-leave', 'multi-device-sync-a-rejoin', 'multi-device-sync-c'
]);
export const WINDOWS_SYNC_GROUP_INTERACTIVE_WORKER_ENV = 'FOLIOLE_SYNC_GROUP_INTERACTIVE_WORKER';

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

export { readJson, writeJsonAtomic };
