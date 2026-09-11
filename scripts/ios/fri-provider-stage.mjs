/* global clearTimeout, setTimeout */

import fs from 'node:fs';
import path from 'node:path';

function append(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(value)}\n`, 'utf8');
}

export function createFriProviderStageRunner({ filePath, signal }) {
  return async function runStage(name, task, timeoutMs = 2 * 60_000) {
    signal?.throwIfAborted();
    const startedAt = new Date().toISOString();
    append(filePath, { name, startedAt, status: 'started' });
    let timeout;
    let abort;
    const deadline = new Promise((resolve, reject) => {
      void resolve;
      timeout = setTimeout(() => reject(new Error(`Fri provider stage timed out: ${name}`)), timeoutMs);
      abort = () => reject(signal?.reason ?? new Error(`Fri provider stage aborted: ${name}`));
      signal?.addEventListener('abort', abort, { once: true });
    });
    try {
      const value = await Promise.race([Promise.resolve().then(task), deadline]);
      append(filePath, { completedAt: new Date().toISOString(), name, startedAt, status: 'passed' });
      return value;
    } catch (error) {
      append(filePath, { completedAt: new Date().toISOString(), error: String(error?.message ?? error),
        name, startedAt, status: 'failed' });
      throw error;
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
    }
  };
}
