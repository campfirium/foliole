import fs from 'node:fs';
import path from 'node:path';

import { captureSyncRuntimeLog } from '../sync-group/sync-runtime-log.mjs';

export const RECEIVE_CURSOR_COMMITTED_EVENT = '[sync-group] receive cursor committed';

export function captureWindowsSyncRuntimeProgress(child, logPath) {
  let cursorCommitted = false;
  let resolveCursorCommitted;
  const committed = new Promise((resolve) => { resolveCursorCommitted = resolve; });
  captureSyncRuntimeLog(child, logPath, (text) => {
    if (cursorCommitted || !text.includes(RECEIVE_CURSOR_COMMITTED_EVENT)) return;
    cursorCommitted = true;
    resolveCursorCommitted();
  });
  return { cursorCommitted: committed };
}

export function readWindowsSyncRuntimeLog(evidenceRoot) {
  const logPath = path.join(evidenceRoot, 'sync-group-runtime.log');
  return fs.existsSync(logPath)
    ? fs.readFileSync(logPath, 'utf8').trim().split(/\r?\n/u).slice(-8).join(' | ')
    : 'unavailable';
}
