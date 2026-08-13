// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';

import { expect, it, vi } from 'vitest';

import {
  captureWindowsSyncRuntimeProgress, RECEIVE_CURSOR_COMMITTED_EVENT
} from './windows-sync-group-runtime-progress.mjs';

it('observes a split committed-cursor event and preserves the runtime log', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-runtime-progress-'));
  const logPath = path.join(root, 'runtime.log');
  const child = { stderr: new PassThrough(), stdout: new PassThrough() };
  const progress = captureWindowsSyncRuntimeProgress(child, logPath);
  const midpoint = Math.floor(RECEIVE_CURSOR_COMMITTED_EVENT.length / 2);
  child.stdout.write(RECEIVE_CURSOR_COMMITTED_EVENT.slice(0, midpoint));
  child.stdout.write(`${RECEIVE_CURSOR_COMMITTED_EVENT.slice(midpoint)} cursor=12\n`);
  await progress.cursorCommitted;
  expect(fs.readFileSync(logPath, 'utf8')).toContain('receive cursor committed');
});

it('does not resolve for unrelated sync runtime output', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-runtime-progress-'));
  const child = { stderr: new PassThrough(), stdout: new PassThrough() };
  const progress = captureWindowsSyncRuntimeProgress(child, path.join(root, 'runtime.log'));
  const resolved = vi.fn();
  void progress.cursorCommitted.then(resolved);
  child.stdout.write('[sync-group] join completed\n');
  await Promise.resolve();
  expect(resolved).not.toHaveBeenCalled();
});
