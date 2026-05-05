import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it } from 'vitest';

import { createReadingPositionTraceLogger } from './readingPositionTraceLog.js';

const tempRoots: string[] = [];

afterEach(() => {
  while (tempRoots.length > 0) {
    const next = tempRoots.pop();
    if (next) {
      fs.rmSync(next, { force: true, recursive: true });
    }
  }
});

it('writes reading-position traces into a single per-process log file', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-reading-position-log-'));
  tempRoots.push(root);
  const logger = createReadingPositionTraceLogger({
    appLogDir: root
  });

  logger.append({
    event: 'runtime.reading-position.updated',
    payload: { selection: { from: 1581, to: 1581 } },
    timestamp: 1
  });
  logger.append({
    event: 'editor.viewport.restore-selection',
    payload: { selection: { from: 0, to: 0 } },
    timestamp: 2
  });

  const filePath = logger.getFilePath();
  expect(path.basename(filePath)).toBe('reading-position.ndjson');
  expect(fs.existsSync(filePath)).toBe(true);
  expect(fs.readFileSync(filePath, 'utf8').trim().split('\n')).toHaveLength(2);
});

it('resets the same file when a new logger is created for the next app start', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-reading-position-log-'));
  tempRoots.push(root);

  const firstLogger = createReadingPositionTraceLogger({ appLogDir: root });
  firstLogger.append({
    event: 'runtime.reading-position.updated',
    payload: { selection: { from: 1581, to: 1581 } },
    timestamp: 1
  });

  const secondLogger = createReadingPositionTraceLogger({ appLogDir: root });
  secondLogger.append({
    event: 'editor.viewport.restore-selection',
    payload: { selection: { from: 0, to: 0 } },
    timestamp: 2
  });

  const lines = fs.readFileSync(secondLogger.getFilePath(), 'utf8').trim().split('\n');
  expect(lines).toHaveLength(1);
  expect(lines[0]).toContain('editor.viewport.restore-selection');
});
