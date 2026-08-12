// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it, vi } from 'vitest';

import { waitForInteractiveResult } from './windows-client-native-interactive.mjs';
import {
  interactiveStatePaths, validateInteractiveRequest, WINDOWS_NATIVE_CLIENT_TASK,
  WINDOWS_NATIVE_CLIENT_WORKER_ENV, writeJsonAtomic
} from './windows-client-native-interactive-state.mjs';

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { force: true, recursive: true });
});

it('accepts only bounded native client actions with a request identity', () => {
  const request = {
    action: 'start', nonce: '12345678-1234-1234-1234-123456789abc', schemaVersion: 1
  };
  expect(validateInteractiveRequest(request)).toBe(request);
  expect(validateInteractiveRequest({ ...request, action: 'status' }).action).toBe('status');
  expect(() => validateInteractiveRequest({ ...request, action: 'stop' })).toThrow('invalid');
  expect(() => validateInteractiveRequest({ ...request, nonce: 'latest' })).toThrow('invalid');
});

it('publishes request state atomically inside the dedicated state root', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-native-client-task-'));
  roots.push(root);
  const paths = interactiveStatePaths(root);
  writeJsonAtomic(paths.status, { schemaVersion: 1, state: 'pending' });
  expect(JSON.parse(fs.readFileSync(paths.status, 'utf8'))).toEqual({ schemaVersion: 1, state: 'pending' });
  expect(fs.readdirSync(root)).toEqual(['status.json']);
});

it('fails quickly when the interactive worker never starts', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-native-client-timeout-'));
  roots.push(root);
  const paths = interactiveStatePaths(root);
  const nonce = '12345678-1234-1234-1234-123456789abc';
  writeJsonAtomic(paths.status, { nonce, schemaVersion: 1, state: 'pending' });
  let current = 0;
  await expect(waitForInteractiveResult(paths, nonce, {
    now: () => current, pause: async () => { current += 5_000; }
  })).rejects.toThrow('did not start within 5 seconds');
});

it('forwards nonce-bound semantic progress exactly once before completion', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-native-client-progress-'));
  roots.push(root);
  const paths = interactiveStatePaths(root);
  const nonce = '12345678-1234-1234-1234-123456789abc';
  const progress = { factId: 'multi-device-sync-c-20260813080000000',
    milestone: 'c-fact-created' };
  writeJsonAtomic(paths.status, { nonce, progress: [progress], schemaVersion: 1, state: 'running' });
  let current = 0;
  const onProgress = vi.fn();
  const result = await waitForInteractiveResult(paths, nonce, {
    now: () => current, onProgress, pause: async () => {
      current += 1;
      writeJsonAtomic(paths.result, { exitCode: 0, nonce, schemaVersion: 1, state: 'completed' });
    }, resultTimeoutMs: 10
  });
  expect(result.exitCode).toBe(0);
  expect(onProgress).toHaveBeenCalledOnce();
  expect(onProgress).toHaveBeenCalledWith(progress);
});

it('keeps the interactive launcher isolated from the Android task control plane', () => {
  const install = fs.readFileSync(
    path.resolve('scripts/windows/install-native-client-interactive-task.ps1'), 'utf8'
  );
  const dispatcher = fs.readFileSync(
    path.resolve('scripts/windows/windows-client-native-interactive.mjs'), 'utf8'
  );
  const worker = fs.readFileSync(
    path.resolve('scripts/windows/windows-client-native-interactive-worker.mjs'), 'utf8'
  );
  expect(WINDOWS_NATIVE_CLIENT_TASK).toBe('FolioleNativeClient');
  expect(WINDOWS_NATIVE_CLIENT_WORKER_ENV).toBe('FOLIOLE_NATIVE_CLIENT_INTERACTIVE_WORKER');
  expect(install).toContain('-LogonType Interactive');
  expect(install).not.toContain('New-ScheduledTaskTrigger');
  expect(install).not.toContain('FoliolePhysicalAcceptance');
  expect(dispatcher).toContain("['/Run', '/TN', WINDOWS_NATIVE_CLIENT_TASK]");
  expect(worker).toContain("[WINDOWS_NATIVE_CLIENT_WORKER_ENV]: '1'");
  expect(worker).toContain("[clientScript, request.action]");
});
