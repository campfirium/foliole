import { spawn } from 'node:child_process';
import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import path from 'node:path';
import { clearTimeout, setTimeout } from 'node:timers';

const APP_ID = 'com.foliole.android';
const DATABASE_CANDIDATES = [
  'databases/foliole-companionSQLite.db',
  'databases/foliole-companion.db'
];

function captureDeviceFile(adbPath, endpoint, devicePath, outputPath, spawnImpl = spawn) {
  return new Promise((resolve, reject) => {
    const child = spawnImpl(adbPath, [
      '-s', endpoint, 'exec-out', 'run-as', APP_ID, 'cat', devicePath
    ], { shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    const output = fs.createWriteStream(outputPath, { mode: 0o600 });
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill?.();
      output.destroy();
      reject(Object.assign(new Error('Android review snapshot timed out'), { code: 'review_snapshot_timeout' }));
    }, 60_000);
    child.stdout.pipe(output);
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.on('close', (code) => {
      clearTimeout(timer);
      output.end(() => code === 0 ? resolve() : reject(new Error(stderr.trim() || `adb exited ${code}`)));
    });
  });
}

function assertSqlite(filePath) {
  const header = Buffer.alloc(16);
  const descriptor = fs.openSync(filePath, 'r');
  try {
    fs.readSync(descriptor, header, 0, header.length, 0);
  } finally {
    fs.closeSync(descriptor);
  }
  if (header.toString('utf8') !== 'SQLite format 3\0') throw new Error('Android companion snapshot is not SQLite');
}

export async function pullAndroidReviewSnapshot({ adbPath, appStopped, destination, endpoint, spawnImpl = spawn }) {
  if (appStopped !== true) {
    throw Object.assign(new Error('Android review snapshot requires a stopped application'), {
      code: 'review_snapshot_requires_stopped_app'
    });
  }
  fs.mkdirSync(destination, { recursive: true });
  let lastError = null;
  for (const devicePath of DATABASE_CANDIDATES) {
    const databasePath = path.join(destination, 'review.db');
    try {
      await captureDeviceFile(adbPath, endpoint, devicePath, databasePath, spawnImpl);
      assertSqlite(databasePath);
      for (const suffix of ['-wal', '-shm']) {
        try {
          await captureDeviceFile(adbPath, endpoint, `${devicePath}${suffix}`, `${databasePath}${suffix}`, spawnImpl);
        } catch {
          fs.rmSync(`${databasePath}${suffix}`, { force: true });
        }
      }
      return databasePath;
    } catch (error) {
      lastError = error;
      fs.rmSync(databasePath, { force: true });
    }
  }
  throw Object.assign(new Error(`Android companion database is unreadable: ${lastError?.message || 'unknown error'}`), {
    code: 'review_database_unreadable'
  });
}
