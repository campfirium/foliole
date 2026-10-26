#!/usr/bin/env node
/* global console, process */
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

export function summarizeSqlRecording(report) {
  if (report?.version !== 1 || !Array.isArray(report.groups) || !Array.isArray(report.windows)) {
    throw new Error('Expected a SQL recording report; the recording may not have stopped yet.');
  }
  const rank = metric => [...report.groups].sort((a, b) => b[metric] - a[metric]).slice(0, 15);
  return {
    startedAt: report.startedAt,
    durationMs: report.durationMs,
    running: report.running,
    pending: report.pending,
    overflowOperations: report.overflowOperations,
    interpretation: 'Ranked leads only; correlate with the operation and verify necessary work before classifying.',
    mostFrequent: rank('count'),
    highestCumulativeMs: rank('totalMs'),
    slowestSingleMs: rank('maxMs'),
    busiestWindows: [...report.windows].sort((a, b) => b.count - a.count).slice(0, 15)
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.length !== 3) throw new Error('Usage: npm run database:record:report -- <report.json>');
    console.log(JSON.stringify(summarizeSqlRecording(JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))), null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
