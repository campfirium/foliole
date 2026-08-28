import fs from 'node:fs';

export function captureSyncRuntimeLog(child, logPath, onText = () => {}) {
  const capture = createStreamCapture({ logPath, onText });
  child.stdout?.on('data', capture.stdout);
  child.stderr?.on('data', capture.stderr);
}

function createStreamCapture({ logPath, onText }) {
  const create = () => {
    let pending = '';
    return (chunk) => {
      pending += String(chunk);
      onText(pending);
      const lines = pending.split(/\r?\n/u);
      pending = lines.pop() ?? '';
      for (const line of lines) fs.appendFileSync(logPath, `${line}\n`, 'utf8');
    };
  };
  return { stderr: create(), stdout: create() };
}
