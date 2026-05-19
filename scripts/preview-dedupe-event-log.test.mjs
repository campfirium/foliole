// @vitest-environment node
/* global process */

import { mkdtemp, readFile, rm, utimes, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { appendPreviewEvent } from './preview-dedupe-event-log.mjs';

describe('preview dedupe event log', () => {
  it('keeps only today in a fixed jsonl file and writes time-only events', async () => {
    const runtimeDir = await mkdtemp(path.join(os.tmpdir(), 'preview-event-log-'));
    try {
      const logPath = path.join(runtimeDir, 'windows-preview.events.jsonl');
      await writeFile(logPath, '{"event":"yesterday"}\n', 'utf8');
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      await utimes(logPath, yesterday, yesterday);

      await appendPreviewEvent({ event: 'today', fields: { runId: 'run-1' }, runtimeDir, target: 'windows' });
      const lines = (await readFile(logPath, 'utf8')).trim().split('\n');
      const entry = JSON.parse(lines[0]);

      expect(lines).toHaveLength(1);
      expect(entry).toMatchObject({ event: 'today', runId: 'run-1', target: 'windows' });
      expect(entry.time).toMatch(/^\d{2}:\d{2}:\d{2}\.\d{3}$/u);
      expect(entry.timestamp).toBeUndefined();
    } finally {
      await rm(runtimeDir, { force: true, recursive: true });
    }
  });
});
