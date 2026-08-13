// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it, vi } from 'vitest';

import { runWindowsDevDeviceAction } from './windows-dev-device-action.mjs';
import { runWindowsSyncGroupInteractiveAction } from './windows-sync-group-interactive-action.mjs';
import {
  readJson, syncGroupInteractivePaths, validateSyncGroupInteractiveProgress,
  validateSyncGroupInteractiveRequest
} from './windows-sync-group-interactive-state.mjs';

const roots = [];

afterEach(() => roots.splice(0).forEach((root) => fs.rmSync(root, { force: true, recursive: true })));

function fixture() {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-group-interactive-'));
  roots.push(repoRoot);
  const evidenceRoot = path.join(repoRoot, '.tmp', 'artifacts', 'windows-dev-action', 'run-1');
  return { evidenceRoot, paths: { repoRoot } };
}

it('runs the Windows C Electron journey in the bounded interactive user task', async () => {
  const options = { action: 'multi-device-sync-c', buildIdentity: 'candidate-1',
    execute: vi.fn(async () => ({ code: 0 })), ...fixture() };
  const installTask = vi.fn(async () => undefined);
  const actionResult = { multiDeviceSyncC: { manifestPath: 'receipt.json' }, output: '' };
  const waitForResult = vi.fn(async () => ({ actionResult, exitCode: 0 }));
  const interactive = syncGroupInteractivePaths(options.paths.repoRoot);
  fs.mkdirSync(path.dirname(interactive.providerRelease), { recursive: true });
  fs.writeFileSync(interactive.providerRelease, '{}', 'utf8');
  await expect(runWindowsSyncGroupInteractiveAction(options, {
    installTask, waitForResult
  })).resolves.toEqual(actionResult);
  expect(installTask).toHaveBeenCalledWith(expect.objectContaining({ executionTimeLimitMinutes: 20 }));
  expect(options.execute).toHaveBeenCalledWith('schtasks.exe',
    ['/Run', '/TN', 'FolioleNativeClient'], expect.any(Object));
  const request = readJson(syncGroupInteractivePaths(options.paths.repoRoot).request);
  expect(request).toMatchObject({ action: options.action, evidenceRoot: options.evidenceRoot, schemaVersion: 1 });
  expect(fs.existsSync(interactive.providerRelease)).toBe(false);
});

it('accepts only registered actions and evidence inside the action-owned root', () => {
  const { evidenceRoot, paths } = fixture();
  const request = { action: 'multi-device-sync-a-rejoin', evidenceRoot,
    nonce: '12345678-1234-1234-1234-123456789abc', schemaVersion: 1 };
  expect(validateSyncGroupInteractiveRequest(request, paths.repoRoot).action).toBe(request.action);
  expect(() => validateSyncGroupInteractiveRequest({ ...request, action: 'verify' }, paths.repoRoot))
    .toThrow('invalid');
  expect(() => validateSyncGroupInteractiveRequest({
    ...request, evidenceRoot: path.join(paths.repoRoot, 'outside')
  }, paths.repoRoot)).toThrow('invalid');
  expect(validateSyncGroupInteractiveProgress({
    factId: 'multi-device-sync-c-20260813080000000', milestone: 'c-fact-created'
  }, 'multi-device-sync-a-leave')).toMatchObject({ milestone: 'c-fact-created' });
  expect(() => validateSyncGroupInteractiveProgress({
    factId: 'old-fact', milestone: 'c-fact-created'
  }, 'multi-device-sync-a-leave')).toThrow('invalid');
  expect(validateSyncGroupInteractiveProgress({
    factId: 'participation-control', milestone: 'windows-paused'
  }, 'multi-device-sync-participation')).toEqual({
    factId: 'participation-control', milestone: 'windows-paused'
  });
  expect(validateSyncGroupInteractiveProgress({
    factId: 'participation-control', milestone: 'macos-departure-observed'
  }, 'multi-device-sync-participation')).toEqual({
    factId: 'participation-control', milestone: 'macos-departure-observed'
  });
  expect(validateSyncGroupInteractiveProgress({
    factId: 'sync-from-zero', milestone: 'c-first-cursor-committed'
  }, 'multi-device-sync-from-zero')).toEqual({
    factId: 'sync-from-zero', milestone: 'c-first-cursor-committed'
  });
});

it('streams the created C fact as nonce-bound provider progress', async () => {
  const options = { action: 'multi-device-sync-a-leave', buildIdentity: 'candidate-1',
    execute: vi.fn(async () => ({ code: 0 })), stdout: { write: vi.fn() }, ...fixture() };
  const progress = { factId: 'multi-device-sync-c-20260813080000000',
    milestone: 'c-fact-created' };
  const waitForResult = vi.fn(async (_paths, _nonce, settings) => {
    settings.onProgress(progress);
    return { actionResult: {}, exitCode: 0 };
  });
  await runWindowsSyncGroupInteractiveAction(options, {
    installTask: vi.fn(async () => undefined), waitForResult
  });
  expect(options.stdout.write).toHaveBeenCalledWith(expect.stringMatching(
    /^\[windows-dev-action\] progress action=multi-device-sync-a-leave nonce=[0-9a-f-]{36} milestone=c-fact-created fact=multi-device-sync-c-20260813080000000\n$/u
  ));
});

it('routes Sync Group desktop actions before the fixed Android device boundary', async () => {
  const options = { action: 'multi-device-sync-c', buildIdentity: 'candidate-1',
    evidenceRoot: 'evidence', execute: vi.fn(), paths: { repoRoot: 'repo' } };
  const expected = { multiDeviceSyncC: { manifestPath: 'receipt.json' }, output: '' };
  const runSyncGroupInteractive = vi.fn(async () => expected);
  await expect(runWindowsDevDeviceAction({
    ...options, runSyncGroupInteractive
  })).resolves.toEqual(expected);
  expect(runSyncGroupInteractive).toHaveBeenCalledWith(options);
  expect(options.execute).not.toHaveBeenCalled();
});
