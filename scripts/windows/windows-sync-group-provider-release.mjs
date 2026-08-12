import fs from 'node:fs';
import path from 'node:path';

import {
  readJson, syncGroupInteractivePaths, validateSyncGroupInteractiveRequest
} from './windows-sync-group-interactive-state.mjs';

/* global clearTimeout, setTimeout */

const RELEASE_TIMEOUT_MS = 12 * 60_000;

function validateRelease(value, action, nonce) {
  if (value?.schemaVersion !== 1 || value.action !== action
      || value.nonce !== nonce
      || !['cancelled', 'consumer_complete'].includes(value.status)) {
    throw new Error('invalid Sync Group provider release');
  }
  return value;
}

export function waitForWindowsSyncGroupProviderRelease({
  action, repoRoot, timeoutMs = RELEASE_TIMEOUT_MS, watchDirectory = fs.watch
}) {
  const paths = syncGroupInteractivePaths(repoRoot);
  const request = validateSyncGroupInteractiveRequest(readJson(paths.request), repoRoot);
  if (request.action !== action) throw new Error('Sync Group provider request action mismatch.');
  const releasePath = paths.providerRelease;
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      watcher.close();
      fs.rmSync(releasePath, { force: true });
      if (error) reject(error); else resolve(value);
    };
    const inspect = () => {
      let value;
      try { value = readJson(releasePath); } catch { return; }
      if (!value) return;
      try {
        const release = validateRelease(value, action, request.nonce);
        if (release.status === 'cancelled') {
          finish(new Error('Sync Group provider release was cancelled.'));
        } else finish(null, release);
      } catch (error) { finish(error); }
    };
    fs.mkdirSync(path.dirname(releasePath), { recursive: true });
    const watcher = watchDirectory(path.dirname(releasePath), inspect);
    const timer = setTimeout(() => finish(new Error('Sync Group provider release timed out.')),
      timeoutMs);
    inspect();
  });
}
