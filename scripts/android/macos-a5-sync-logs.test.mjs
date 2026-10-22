import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { expect, it, vi } from 'vitest';

import { parseA5SyncLogcat, readA5SyncLogs } from './macos-a5-sync-logs.mjs';

it('retains current native request timing and discards unrelated or sensitive fields', () => {
  const prefix = '1792547645.123 16250 16251 D FolioleSyncHttp: ';
  const request = 'request_id=6b24f939-6649-4882-80f5-b809049296d5 origin=http://192.168.0.10:38641 operation=pulls ';
  expect(parseA5SyncLogcat([
    prefix + request + 'phase=response_code duration_ms=60001.25 request_bytes=1254 token=private',
    prefix + request + 'phase=write duration_ms=3 chunk=0 bytes=1254 request_bytes=1254',
    prefix + request + 'phase=unknown duration_ms=1 request_bytes=1',
    prefix + request.replace(':38641 ', ':38641/private?token=secret ') + 'phase=flush duration_ms=1',
    prefix + request + 'phase=flush duration_ms=NaN',
    prefix + 'unrelated private message'
  ].join('\n'))).toEqual([
    { at: '2026-10-21T01:54:05.123Z', pid: 16250, requestId: '6b24f939-6649-4882-80f5-b809049296d5',
      origin: 'http://192.168.0.10:38641', operation: 'pulls', phase: 'response_code', elapsedMs: 60001.25, requestBytes: 1254 },
    { at: '2026-10-21T01:54:05.123Z', pid: 16250, requestId: '6b24f939-6649-4882-80f5-b809049296d5',
      origin: 'http://192.168.0.10:38641', operation: 'pulls', phase: 'write', elapsedMs: 3,
      requestBytes: 1254, chunk: 0, bytes: 1254 }
  ]);
});

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
      '-s', '87a33a4b', 'logcat', '-d', '-v', 'epoch', '-s', 'Capacitor/Console:I', 'FolioleSyncHttp:D'
    ], { maxBuffer: 8 * 1024 * 1024 });
    expect(JSON.parse(fs.readFileSync(result.filePath, 'utf8')).rows).toMatchObject([
      { runId: 'run-2', stage: 'push', status: 'started' }
    ]);
  } finally {
    fs.rmSync(artifactsRoot, { recursive: true, force: true });
  }
});

it('retains snapshot phase timing without exposing private source paths', () => {
  const rows = parseA5SyncLogcat('1759480001.003 12 13 I Capacitor/Console: [FolioleSync] '
    + JSON.stringify({ runId: 'snapshot-1', stage: 'identity_facts', status: 'completed',
      elapsedMs: 1234, snapshotPath: '/private/library.db', token: 'private-token' }));
  expect(rows).toEqual([{ at: '2025-10-03T08:26:41.003Z', runId: 'snapshot-1',
    stage: 'identity_facts', status: 'completed', elapsedMs: 1234 }]);
});

it('keeps scheduling events for local edits, triggers and run boundaries with their reasons', () => {
  const line = (json) => `1759480000.010 12 13 I Capacitor/Console: File: index.js - Line 2 - Msg: [FolioleSync] ${json}`;
  expect(parseA5SyncLogcat([
    line('{"runId":"scheduler","stage":"local_edit","status":"completed","queuedMs":2410,"writeMs":35}'),
    line('{"runId":"scheduler","stage":"round_request","status":"started","reason":"mutation","decision":"in_flight","note":"Private Title"}'),
    line('{"runId":"scheduler","stage":"foreground_run","status":"completed","reason":"retry","outcome":"backlog","token":"x"}')
  ].join('\n'))).toEqual([
    { at: '2025-10-03T08:26:40.010Z', runId: 'scheduler', stage: 'local_edit', status: 'completed', queuedMs: 2410, writeMs: 35 },
    { at: '2025-10-03T08:26:40.010Z', runId: 'scheduler', stage: 'round_request', status: 'started',
      reason: 'mutation', decision: 'in_flight' },
    { at: '2025-10-03T08:26:40.010Z', runId: 'scheduler', stage: 'foreground_run', status: 'completed',
      reason: 'retry', outcome: 'backlog' }
  ]);
});
