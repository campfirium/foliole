import fs from 'node:fs';
import path from 'node:path';

export const RECEIVE_CURSOR_COMMITTED_EVENT = '[sync-group] receive cursor committed';

export function captureWindowsSyncRuntimeProgress(child, logPath) {
  let cursorCommitted = false;
  let resolveCursorCommitted;
  const committed = new Promise((resolve) => { resolveCursorCommitted = resolve; });
  const capture = createStreamCapture({ logPath, onText(text) {
    if (cursorCommitted || !text.includes(RECEIVE_CURSOR_COMMITTED_EVENT)) return;
    cursorCommitted = true;
    resolveCursorCommitted();
  } });
  child.stdout?.on('data', capture.stdout);
  child.stderr?.on('data', capture.stderr);
  return { cursorCommitted: committed };
}

export function readWindowsSyncRuntimeLog(evidenceRoot) {
  const logPath = path.join(evidenceRoot, 'sync-group-runtime.log');
  return fs.existsSync(logPath)
    ? fs.readFileSync(logPath, 'utf8').trim().split(/\r?\n/u).slice(-8).join(' | ')
    : 'unavailable';
}

function createStreamCapture({ logPath, onText }) {
  const create = () => {
    let pending = '';
    return (chunk) => {
      pending += String(chunk);
      onText(pending);
      const lines = pending.split(/\r?\n/u);
      pending = lines.pop() ?? '';
      for (const line of lines) {
        fs.appendFileSync(logPath, `${line}\n`, 'utf8');
      }
    };
  };
  return { stderr: create(), stdout: create() };
}
