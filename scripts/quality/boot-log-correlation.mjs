#!/usr/bin/env node
/* global console, process */

// Aligns main-process stalls (`app_responsive` drift) in native-boot-events.ndjson with the
// desktop tasks running at that moment, and summarises the longest run of each task label.
// Used by the main-thread blocking audit of the foliole-quality-maintenance skill.
//
//   node scripts/quality/boot-log-correlation.mjs <native-boot-events.ndjson> [minDriftMs=1000]

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FINISHED_STAGES = new Set(['desktop_task_completed', 'desktop_task_failed', 'desktop_task_cancelled']);

export function parseEvents(text) {
  return text.split('\n').filter((line) => line.trim()).map((line) => {
    try {
      return JSON.parse(line);
    } catch {
      return null;
    }
  }).filter(Boolean);
}

export function correlateBootEvents(events, { minDriftMs = 1000, stallLimit = 40, taskLimit = 30 } = {}) {
  const running = new Map();
  const stalls = [];
  const durations = new Map();
  for (const event of events) {
    const payload = event.payload ?? {};
    if (event.stage === 'desktop_task_started') running.set(payload.id, payload.label);
    if (FINISHED_STAGES.has(event.stage)) {
      running.delete(payload.id);
      if (payload.durationMs != null) {
        if (!durations.has(payload.label)) durations.set(payload.label, []);
        durations.get(payload.label).push(payload.durationMs);
      }
    }
    if (event.stage === 'app_responsive' && payload.driftMs >= minDriftMs) {
      stalls.push({ at: event.timestamp, driftMs: payload.driftMs, running: [...running.values()].join(' | ') });
    }
  }
  return {
    eventCount: events.length,
    lastAt: events.at(-1)?.timestamp ?? 'none',
    stalls: stalls.sort((a, b) => b.driftMs - a.driftMs).slice(0, stallLimit),
    tasks: [...durations.entries()]
      .map(([label, values]) => ({ label, runs: values.length, maxMs: Math.max(...values) }))
      .sort((a, b) => b.maxMs - a.maxMs)
      .slice(0, taskLimit)
  };
}

function main(argv) {
  const [logPath, minDriftArg] = argv;
  if (!logPath) {
    console.error('Usage: node scripts/quality/boot-log-correlation.mjs <native-boot-events.ndjson> [minDriftMs=1000]');
    return 1;
  }
  const result = correlateBootEvents(parseEvents(readFileSync(logPath, 'utf8')), { minDriftMs: Number(minDriftArg ?? 1000) });
  console.log(`Events: ${result.eventCount}, last written: ${result.lastAt}`);
  console.log('Longest stalls with running tasks:');
  console.table(result.stalls);
  console.log('Task durations (label, runs, max ms):');
  console.table(result.tasks);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  process.exitCode = main(process.argv.slice(2));
}
