// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it } from 'vitest';

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
