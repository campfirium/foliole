import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { expect, it } from 'vitest';

import { createActionExecutor } from './multi-device-sync-action-executor.mjs';

/* global AbortController, setTimeout */

function executor() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-action-executor-'));
  const progressPath = path.join(root, 'progress.jsonl');
  return { execute: createActionExecutor({ logPath: path.join(root, 'action.log'), progressPath }),
    progressPath };
}

it('enforces the supplied hard deadline instead of passing timeoutMs to spawn', async () => {
  const { execute } = executor();
  const result = await execute(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
    action: 'bounded', hardDeadlineMs: 40, host: 'macos-a', stage: 'test'
  });
  expect(result).toMatchObject({ code: 124, terminationReason: 'hard_deadline' });
});

it('does not treat stdout bytes as semantic progress or extend the hard deadline', async () => {
  const { execute, progressPath } = executor();
  const result = await execute(process.execPath, ['-e',
    'setInterval(() => process.stdout.write("noise\\n"), 5)'], {
    action: 'noisy', hardDeadlineMs: 45, host: 'android-b', stage: 'test'
  });
  expect(result.code).toBe(124);
  const events = fs.readFileSync(progressPath, 'utf8').trim().split('\n').map(JSON.parse);
  expect(events.some(({ event }) => event === 'diagnostic_bytes')).toBe(true);
  expect(events.some(({ event }) => event === 'semantic_progress')).toBe(false);
});

it('records caller cancellation separately from a product stall', async () => {
  const controller = new AbortController();
  const { execute } = executor();
  setTimeout(() => controller.abort(), 20);
  await expect(execute(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
    action: 'cancelled', hardDeadlineMs: 500, host: 'windows-c', signal: controller.signal,
    stage: 'test'
  })).resolves.toMatchObject({ code: 125, terminationReason: 'cancelled' });
});
