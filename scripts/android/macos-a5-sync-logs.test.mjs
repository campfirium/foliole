import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { expect, it, vi } from 'vitest';

import { parseA5SyncLogcat, readA5SyncLogs } from './macos-a5-sync-logs.mjs';

it('keeps only structured sync timing records from Android console logs', () => {
  const rows = parseA5SyncLogcat([
    '1759480000.001 12 13 I Capacitor/Console: File: index.js - Line 2 - Msg: [FolioleSync] {"runId":"run-1","stage":"structure_page","status":"started","page":1,"fromCursor":0}',
    '1759480000.002 12 13 E Capacitor/Console: File: index.js - Line 3 - Msg: secret token',
    '1759480001.003 12 13 I Capacitor/Console: File: index.js - Line 2 - Msg: [FolioleSync] {"runId":"run-1","stage":"structure_page","status":"completed","page":1,"elapsedMs":1002,"appliedObjects":3}',
    '1759480002.004 12 13 I Capacitor/Console: File: index.js - Line 2 - Msg: [FolioleSync] not-json'
  ].join('\n'));
  expect(rows).toEqual([
    { at: '2025-10-03T08:26:40.001Z', runId: 'run-1', stage: 'structure_page',
      status: 'started', page: 1, fromCursor: 0 },
    { at: '2025-10-03T08:26:41.003Z', runId: 'run-1', stage: 'structure_page',
      status: 'completed', page: 1, elapsedMs: 1002, appliedObjects: 3 }
  ]);
});

it('reads fixed A5 Logcat without changing the app or exposing other messages', () => {
  const artifactsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'a5-sync-logs-'));
  try {
    const assertFixed = vi.fn();
    const captured = vi.fn(() => '1759480000.001 12 13 I Capacitor/Console: File: app.js - Line 1 - Msg: [FolioleSync] {"runId":"run-2","stage":"push","status":"started"}\n');
    const result = readA5SyncLogs({ assertFixed, buildIdentity: () => 'capture-1', captured,
      paths: { adb: '/fixed/adb', artifactsRoot }, serial: '87a33a4b' });
    expect(assertFixed).toHaveBeenCalledOnce();
    expect(captured).toHaveBeenCalledWith('/fixed/adb', [
      '-s', '87a33a4b', 'logcat', '-d', '-v', 'epoch', '-s', 'Capacitor/Console:I'
    ], { maxBuffer: 8 * 1024 * 1024 });
    expect(JSON.parse(fs.readFileSync(result.filePath, 'utf8')).rows).toMatchObject([
      { runId: 'run-2', stage: 'push', status: 'started' }
    ]);
  } finally {
    fs.rmSync(artifactsRoot, { recursive: true, force: true });
  }
});
