// @vitest-environment node

import { EventEmitter } from 'node:events';
import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { setImmediate } from 'node:timers';
import { describe, expect, it } from 'vitest';

import { pullAndroidReviewSnapshot } from './windows-android-lab-review-snapshot.mjs';

function successfulAdb(calls) {
  return (command, args, options) => {
    calls.push({ args, command, options });
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    setImmediate(() => {
      child.stdout.end(Buffer.from('SQLite format 3\0snapshot'));
      child.emit('close', 0);
    });
    return child;
  };
}

describe('Windows Android lab Review snapshot', () => {
  it('reads only fixed app-private database files without shell or write commands', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'windows-android-lab-review-snapshot-'));
    const calls = [];
    try {
      const databasePath = await pullAndroidReviewSnapshot({
        adbPath: 'adb.exe', appStopped: true, destination: root,
        endpoint: '192.168.1.8:34567', spawnImpl: successfulAdb(calls)
      });
      expect(fs.readFileSync(databasePath).subarray(0, 16).toString()).toBe('SQLite format 3\0');
      expect(calls[0].args).toEqual([
        '-s', '192.168.1.8:34567', 'exec-out', 'run-as', 'com.foliole.android',
        'cat', 'databases/foliole-companionSQLite.db'
      ]);
      expect(calls.flatMap(({ args }) => args).join(' ')).not.toMatch(/push|\brm\b|sh -c|write/iu);
    } finally {
      fs.rmSync(root, { force: true, recursive: true });
    }
  });

  it('rejects callers that did not establish the stopped-app snapshot boundary', async () => {
    await expect(pullAndroidReviewSnapshot({
      adbPath: 'adb.exe', destination: 'unused', endpoint: '192.168.1.8:34567'
    })).rejects.toMatchObject({ code: 'review_snapshot_requires_stopped_app' });
  });
});
