import { spawn } from 'node:child_process';
import fs from 'node:fs';

/* global Buffer, clearTimeout, setTimeout */

const LOG_LIMIT = 64 * 1024 ** 2;

function appendBounded(logPath, text) {
  const current = fs.existsSync(logPath) ? fs.statSync(logPath).size : 0;
  if (current >= LOG_LIMIT) return;
  fs.appendFileSync(logPath, text.slice(0, LOG_LIMIT - current), 'utf8');
}

function progressRecord(progressPath, event) {
  fs.appendFileSync(progressPath, `${JSON.stringify({
    at: new Date().toISOString(), ...event
  })}\n`, 'utf8');
}

function terminationCode(reason, code) {
  if (reason === 'hard_deadline') return 124;
  if (reason === 'cancelled') return 125;
  return code ?? 1;
}

export function createActionExecutor({ logPath, progressPath, spawnImpl = spawn }) {
  return (command, args, options = {}) => new Promise((resolve, reject) => {
    const { action = command, hardDeadlineMs = options.timeoutMs, host = 'unknown',
      onOutput, signal, stage = 'unknown' } = options;
    const spawnOptions = { ...options };
    for (const key of ['action', 'hardDeadlineMs', 'host', 'onOutput', 'signal', 'stage', 'timeoutMs']) {
      delete spawnOptions[key];
    }
    if (!Number.isFinite(hardDeadlineMs) || hardDeadlineMs <= 0) {
      reject(new Error(`Action ${action} requires a positive hard deadline.`)); return;
    }
    const child = spawnImpl(command, args, { ...spawnOptions, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = ''; let stderr = ''; let stdout = ''; let terminationReason = null;
    progressRecord(progressPath, { action, event: 'started', hardDeadlineMs, host, stage });
    const terminate = (reason) => {
      if (terminationReason) return;
      terminationReason = reason; child.kill('SIGKILL');
      progressRecord(progressPath, { action, event: 'termination_requested', host, reason, stage });
    };
    const deadline = setTimeout(() => terminate('hard_deadline'), hardDeadlineMs);
    const onAbort = () => terminate('cancelled');
    signal?.addEventListener('abort', onAbort, { once: true });
    const capture = (stream, chunk) => {
      const text = chunk.toString(); output += text;
      if (stream === 'stdout') stdout += text; else stderr += text;
      appendBounded(logPath, text);
      progressRecord(progressPath, { action, bytes: Buffer.byteLength(text),
        event: 'diagnostic_bytes', host, stream, stage });
      onOutput?.({ output, stderr, stdout, stream, text });
    };
    child.stdout.on('data', (chunk) => capture('stdout', chunk));
    child.stderr.on('data', (chunk) => capture('stderr', chunk));
    child.on('error', (error) => {
      clearTimeout(deadline); signal?.removeEventListener('abort', onAbort); reject(error);
    });
    child.on('close', (code, childSignal) => {
      clearTimeout(deadline); signal?.removeEventListener('abort', onAbort);
      progressRecord(progressPath, { action, event: 'completed', host,
        reason: terminationReason || 'process_exit', stage });
      resolve({ code: terminationCode(terminationReason, code), childSignal,
        lines: output.split(/\r?\n/u).filter(Boolean), output, stderr, stdout,
        terminationReason });
    });
  });
}
