import fs from 'node:fs';
import path from 'node:path';
import { clearTimeout, setTimeout } from 'node:timers';

import { captureSyncRuntimeLog } from '../sync-group/sync-runtime-log.mjs';

export const RECEIVE_OBJECT_COMMITTED_EVENT = '[sync-group] receive dataset object committed';
export const ADVERTISEMENT_REGISTERED_EVENT = '"event":"register_completed"';

export function captureWindowsSyncRuntimeProgress(child, logPath) {
  let objectCommitted = false;
  let resolveCursorCommitted;
  const committed = new Promise((resolve) => { resolveCursorCommitted = resolve; });
  let advertisementRegistered = false;
  let resolveAdvertisementRegistered;
  const registered = new Promise((resolve) => { resolveAdvertisementRegistered = resolve; });
  captureSyncRuntimeLog(child, logPath, (text) => {
    if (!objectCommitted && text.includes(RECEIVE_OBJECT_COMMITTED_EVENT)) {
      objectCommitted = true;
      resolveCursorCommitted();
    }
    if (!advertisementRegistered && text.includes(ADVERTISEMENT_REGISTERED_EVENT)) {
      advertisementRegistered = true;
      resolveAdvertisementRegistered();
    }
  });
  return { advertisementRegistered: registered, objectCommitted: committed };
}

export function waitForWindowsProviderDiscoverable(progress, timeoutMs = 30_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(
      'Windows C DNS-SD advertisement did not become discoverable.'
    )), timeoutMs);
    void progress.advertisementRegistered.then(() => {
      clearTimeout(timer);
      resolve();
    }, reject);
  });
}

export function readWindowsSyncRuntimeLog(evidenceRoot) {
  const logPath = path.join(evidenceRoot, 'sync-group-runtime.log');
  return fs.existsSync(logPath)
    ? fs.readFileSync(logPath, 'utf8').trim().split(/\r?\n/u).slice(-8).join(' | ')
    : 'unavailable';
}
