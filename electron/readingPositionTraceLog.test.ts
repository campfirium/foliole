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

it('keeps appending to the same file when a new logger is created for the next app start', () => {
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
  expect(lines).toHaveLength(2);
  expect(lines[0]).toContain('runtime.reading-position.updated');
  expect(lines[1]).toContain('editor.viewport.restore-selection');
});

const maxLogBytes = 4 * 1024 * 1024;

function createTestLogger() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-reading-position-log-'));
  tempRoots.push(root);
  return { root, logger: createReadingPositionTraceLogger({ appLogDir: root }) };
}

function readTimestamps(filePath: string) {
  return fs.readFileSync(filePath, 'utf8').trimEnd().split('\n')
    .map((line) => (JSON.parse(line) as { timestamp: number }).timestamp);
}

it('stays within the byte limit across successive writes and a logger restart', () => {
  const { root, logger } = createTestLogger();
  const filePath = logger.getFilePath();
  const payload = '阅'.repeat(300_000);
  for (let timestamp = 1; timestamp <= 12; timestamp++) {
    logger.append({ event: 'scroll', payload, timestamp });
    expect(fs.statSync(filePath).size).toBeLessThanOrEqual(maxLogBytes);
  }

  const restarted = createReadingPositionTraceLogger({ appLogDir: root });
  restarted.append({ event: 'restart', payload: null, timestamp: 13 });
  expect(readTimestamps(filePath).slice(-3)).toEqual([11, 12, 13]);
  expect(readTimestamps(filePath)).not.toContain(1);
  expect(fs.statSync(filePath).size).toBeLessThanOrEqual(maxLogBytes);
});

it('keeps complete recent records from an existing oversized file on the first write', () => {
  const { root, logger } = createTestLogger();
  const filePath = logger.getFilePath();
  const oldLine = JSON.stringify({ event: 'scroll', payload: '阅'.repeat(20_000), timestamp: 1 });
  fs.writeFileSync(filePath, `${oldLine}\n`.repeat(280));
  fs.appendFileSync(filePath, '{"event":"old-recent","timestamp":2}\n{"interrupted":');

  createReadingPositionTraceLogger({ appLogDir: root }).append({ event: 'recent', payload: null, timestamp: 3 });

  expect(fs.statSync(filePath).size).toBeLessThanOrEqual(maxLogBytes);
  expect(readTimestamps(filePath).slice(-2)).toEqual([2, 3]);
});

it('keeps existing records when a single trace exceeds the byte budget', () => {
  const { logger } = createTestLogger();
  logger.append({ event: 'scroll', payload: null, timestamp: 1 });

  logger.append({ event: 'oversized trace', payload: '阅'.repeat(1_400_000), timestamp: 2 });

  expect(readTimestamps(logger.getFilePath())).toEqual([1]);
});
