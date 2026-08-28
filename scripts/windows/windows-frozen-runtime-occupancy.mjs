/* global clearTimeout, process, setTimeout */

import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const READY_TIMEOUT_MS = 15_000;
const HOLD_FLAG = '--hold-frozen-runtime';

function digestFile(filePath, fsApi = fs) {
  return createHash('sha256').update(fsApi.readFileSync(filePath)).digest('hex');
}

export function frozenRuntimeFingerprint(sourceRoot, fsApi = fs) {
  const nativeModule = path.join(sourceRoot, 'node_modules', 'better-sqlite3',
    'build', 'Release', 'better_sqlite3.node');
  if (!fsApi.existsSync(nativeModule)) {
    throw new Error('Frozen Windows runtime native module is missing.');
  }
  return {
    lockfileDigest: digestFile(path.join(sourceRoot, 'package-lock.json'), fsApi),
    nativeModuleDigest: digestFile(nativeModule, fsApi),
    sourceRoot
  };
}

function fingerprintsMatch(left, right) {
  return left?.lockfileDigest === right?.lockfileDigest
    && left?.nativeModuleDigest === right?.nativeModuleDigest
    && left?.sourceRoot === right?.sourceRoot;
}

export function startFrozenRuntimeOccupancy(sourceRoot, {
  nodeBin, spawnImpl = spawn
} = {}) {
  const child = spawnImpl(nodeBin, [fileURLToPath(import.meta.url), HOLD_FLAG, sourceRoot], {
    cwd: sourceRoot, shell: false, stdio: ['ignore', 'ignore', 'ignore', 'ipc'], windowsHide: true
  });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Frozen runtime occupancy did not become ready.')),
      READY_TIMEOUT_MS);
    child.once('error', (error) => { clearTimeout(timer); reject(error); });
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`Frozen runtime occupancy exited early with ${code ?? 1}.`));
    });
    child.once('message', (message) => {
      clearTimeout(timer);
      if (message?.status !== 'ready' || message.pid !== child.pid) {
        reject(new Error('Frozen runtime occupancy readiness is invalid.'));
        return;
      }
      resolve({ child, fingerprint: message.fingerprint, pid: child.pid, sourceRoot });
    });
  });
}

export function assertFrozenRuntimeOccupied(occupancy, fsApi = fs) {
  if (!occupancy?.child || occupancy.child.exitCode !== null
      || !fingerprintsMatch(occupancy.fingerprint,
        frozenRuntimeFingerprint(occupancy.sourceRoot, fsApi))) {
    throw new Error('First frozen Windows runtime changed during the second attempt.');
  }
  return occupancy.fingerprint;
}

export function stopFrozenRuntimeOccupancy(occupancy) {
  if (!occupancy?.child || occupancy.child.exitCode !== null) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Frozen runtime occupancy did not stop.')),
      READY_TIMEOUT_MS);
    occupancy.child.once('exit', () => { clearTimeout(timer); resolve(); });
    occupancy.child.kill('SIGTERM');
  });
}

if (process.argv[2] === HOLD_FLAG) {
  const sourceRoot = process.argv[3];
  const fingerprint = frozenRuntimeFingerprint(sourceRoot);
  process.on('SIGTERM', () => process.exit(0));
  process.send?.({ fingerprint, pid: process.pid, status: 'ready' });
  globalThis.setInterval(() => undefined, 60_000);
}
