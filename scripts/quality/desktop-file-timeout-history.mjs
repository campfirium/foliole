/* global process */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { DEFAULT_FILE_TIMEOUT_MS } from './hosted-desktop-test-file.mjs';

const MINUTE = 60_000;
const MAX_SAMPLES = 10;

export function timeoutFromSamples(samples) {
  if (!samples.length) return DEFAULT_FILE_TIMEOUT_MS;
  const slowest = Math.max(...samples);
  const estimate = samples.length === 1
    ? Math.max(DEFAULT_FILE_TIMEOUT_MS, slowest + MINUTE)
    : slowest + Math.max(MINUTE, slowest - Math.min(...samples));
  return Math.ceil(estimate / MINUTE) * MINUTE;
}

const artifactAttempt = file => Number(/^desktop-(?:source|retry)-[^/\\]+-(\d+)[/\\]/u.exec(file)?.[1]);

export function readDesktopTimeoutHistory(root, platform = process.platform) {
  const samples = new Map();
  if (!root || !existsSync(root)) return samples;
  const runs = readdirSync(root).filter(name => /^\d+$/u.test(name))
    .sort((a, b) => Number(b) - Number(a));
  const retries = new Map();
  for (const run of runs) {
    const dir = path.join(root, run);
    const files = readdirSync(dir, { recursive: true }).filter(file => file.endsWith('.execution.json'))
      .sort((a, b) => artifactAttempt(b) - artifactAttempt(a));
    // A rerun can upload another result for the same file. Take its latest completed attempt.
    const latest = new Map();
    for (const file of files) {
      const attempt = artifactAttempt(file);
      if (!Number.isSafeInteger(attempt) || attempt < 1) continue;
      let row;
      try {
        row = JSON.parse(readFileSync(path.join(dir, file), 'utf8'));
      } catch {
        continue;
      }
      if (!row) continue;
      if (row.platform !== platform || row.status !== 'passed' || typeof row.file !== 'string' ||
          !Number.isSafeInteger(row.durationMs) || row.durationMs <= 0) continue;
      if (file.startsWith('desktop-retry-')) {
        let source;
        try {
          source = JSON.parse(readFileSync(path.join(dir, path.dirname(file), 'source.json'), 'utf8'));
        } catch {
          continue;
        }
        if (!/^[1-9]\d*$/u.test(source?.runId) || source.original?.file !== row.file ||
            source.original?.platform !== platform || source.original?.status !== 'timeout') continue;
        const seen = retries.get(row.file) ?? new Set();
        if (seen.has(source.runId)) continue;
        seen.add(source.runId);
        retries.set(row.file, seen);
      }
      const old = latest.get(row.file);
      if (!old || attempt > old.attempt) latest.set(row.file, { attempt, duration: row.durationMs });
    }
    for (const [file, { duration }] of latest) {
      const values = samples.get(file) ?? [];
      if (values.length < MAX_SAMPLES) samples.set(file, [...values, duration]);
    }
  }
  return samples;
}
