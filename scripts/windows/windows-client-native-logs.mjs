/* global console */

import fs from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

export async function createClientLogStreams(logDir, session) {
  await mkdir(logDir, { recursive: true });
  const stdoutLog = path.join(logDir, `${session}.out.log`);
  const stderrLog = path.join(logDir, `${session}.err.log`);
  return {
    stderrFd: fs.openSync(stderrLog, 'a'),
    stderrLog,
    stdoutFd: fs.openSync(stdoutLog, 'a'),
    stdoutLog
  };
}

export function closeClientLogStreams(logs) {
  fs.closeSync(logs.stdoutFd);
  fs.closeSync(logs.stderrFd);
}

function readLogTail(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8').split(/\r?\n/u).filter(Boolean).slice(-80).join('\n');
  } catch {
    return '';
  }
}

export function printStartupLogTail(state) {
  const stderrTail = state?.stderrLog ? readLogTail(state.stderrLog) : '';
  const stdoutTail = state?.stdoutLog ? readLogTail(state.stdoutLog) : '';
  if (stderrTail) {
    console.error(`[windows-restart-client] stderr tail:\n${stderrTail}`);
  }
  if (stdoutTail) {
    console.error(`[windows-restart-client] stdout tail:\n${stdoutTail}`);
  }
}
