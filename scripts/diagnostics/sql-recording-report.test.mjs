// @vitest-environment node
import assert from 'node:assert/strict';
import { test } from 'vitest';

import { summarizeSqlRecording } from './sql-recording-report.mjs';

test('surfaces both frequent cheap statements and a single expensive statement without classifying them', () => {
  const report = summarizeSqlRecording({ version: 1, groups: [
    { sql: 'frequent', count: 100, totalMs: 200, maxMs: 2 },
    { sql: 'slow', count: 1, totalMs: 500, maxMs: 500 }
  ], windows: [{ offsetMs: 0, count: 100 }, { offsetMs: 1000, count: 1 }], pending: 1, overflowOperations: 2 });
  assert.equal(report.mostFrequent[0].sql, 'frequent');
  assert.equal(report.slowestSingleMs[0].sql, 'slow');
  assert.equal(report.highestCumulativeMs[0].sql, 'slow');
  assert.equal(report.busiestWindows[0].offsetMs, 0);
  assert.equal(report.pending, 1);
  assert.equal(report.overflowOperations, 2);
  assert.throws(() => summarizeSqlRecording({}), /may not have stopped/);
});
