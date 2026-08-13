import fs from 'node:fs';

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

function createStreamCapture({ logPath, onText }) {
  const create = () => {
    let pending = '';
    return (chunk) => {
      pending += String(chunk);
      onText(pending);
      const lines = pending.split(/\r?\n/u);
      pending = lines.pop() ?? '';
      for (const line of lines) {
        if (line.includes('[sync-group]') || line.includes('[companion-sync]')) {
          fs.appendFileSync(logPath, `${line}\n`, 'utf8');
        }
      }
    };
  };
  return { stderr: create(), stdout: create() };
}
