import fs from 'node:fs';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { measureAttachmentQueues } from './a5-attachment-queue-measurement.mjs';
import { PERFORMANCE_APP_ID } from './a5-database-performance-build.mjs';

const roots = [];
afterEach(() => roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true })));
function fixture(change = {}) {
  const root = fs.mkdtempSync(path.resolve('.tmp/artifacts/queue-measurement-'));
  roots.push(root);
  const sample = Object.fromEntries(['baselineImage', 'baselineSql', 'maintenance', 'imageDuring', 'sqlDuring']
    .map(name => [name, { queueMs: 1, executionMs: 2, totalMs: 3 }]));
  const value = { appId: PERFORMANCE_APP_ID, scenario: 'attachment-queue', status: 'passed',
    cleanup: true, runs: Array.from({ length: 5 }, () => sample), ...change };
  const calls = [];
  return { root, value, calls, args: { evidenceRoot: root, serial: 'fixed-a5', paths: { adb: '/adb' },
    options: {}, execute: async (_command, args) => {
      calls.push(args);
      return { code: 0, output: args.includes('instrument') ? 'OK (1 test)' : JSON.stringify(value) };
    } } };
}

it('collects fixed instrumentation and persists verified queue samples without touching the daily app', async () => {
  const test = fixture();
  const result = await measureAttachmentQueues(test.args);
  expect(JSON.parse(fs.readFileSync(result.evidencePath))).toEqual(test.value);
  expect(test.calls[0]).toContain('com.foliole.android.FolioleAttachmentQueueMeasurementTest');
  expect(test.calls[1]).toEqual(['-s', 'fixed-a5', 'exec-out', 'run-as', PERFORMANCE_APP_ID,
    'cat', 'files/attachment-queue-result.json']);
  expect(test.calls.flat()).not.toContain('com.campfirium.foliole.android');
});

it.each([{ cleanup: false }, { appId: 'com.campfirium.foliole.android' }, { runs: [] },
  { runs: Array.from({ length: 5 }, () => ({})) }])('rejects incomplete evidence %j', async change => {
  await expect(measureAttachmentQueues(fixture(change).args)).rejects.toThrow(/invalid/u);
});

it('does not read a stale result when instrumentation fails', async () => {
  const test = fixture();
  let count = 0;
  test.args.execute = async () => { count++; return { code: 0, output: 'FAILURES!!!' }; };
  await expect(measureAttachmentQueues(test.args)).rejects.toThrow('instrumentation failed');
  expect(count).toBe(1);
});
