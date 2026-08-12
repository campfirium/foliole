// @vitest-environment node
/* global process */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it, vi } from 'vitest';

import {
  freshJourneyFactIds, startWindowsARejoinProvider
} from './multi-device-sync-a-rejoin-provider.mjs';
import { startWindowsSyncGroupProvider } from './multi-device-sync-windows-provider.mjs';

const roots = [];

afterEach(() => roots.splice(0).forEach((root) => fs.rmSync(root, { force: true, recursive: true })));

it('releases the fixed Windows provider only after consumer completion', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'a-rejoin-provider-'));
  roots.push(repoRoot);
  const evidenceRoot = path.join(repoRoot, 'evidence');
  fs.mkdirSync(evidenceRoot, { recursive: true });
  const remoteRoot = path.join(repoRoot, '.tmp/artifacts/multi-device-sync/windows-c/run-1');
  fs.mkdirSync(remoteRoot, { recursive: true });
  fs.writeFileSync(path.join(remoteRoot, 'multi-device-sync-a-rejoin-receipt.json'),
    JSON.stringify({ factIds: { A: 'a', B: 'b', C: 'c' } }), 'utf8');
  let finishWindows;
  const execute = vi.fn((_command, args) => args.at(-1) === 'multi-device-sync-provider-complete'
    ? Promise.resolve({ code: 0 })
    : new Promise((resolve) => { finishWindows = () => resolve({
      code: 0, output: '[windows-dev-action] multi-device-sync-a-rejoin identity=run-1\n'
    }); }));
  const provider = startWindowsARejoinProvider({ evidenceRoot, execute, repoRoot });
  await provider.release('consumer_complete');
  finishWindows();
  await expect(provider.finish()).resolves.toMatchObject({ receipt: { factIds: { C: 'c' } } });
  expect(execute).toHaveBeenCalledWith(process.execPath, [
    'scripts/windows/windows-dev-control.mjs', 'multi-device-sync-provider-complete'
  ], expect.objectContaining({ action: 'windows-c-provider-release' }));
});

it('derives one fresh identity per device without reusing the prior journey', () => {
  expect(freshJourneyFactIds({ old: 'A', a: 'A', b: 'B', c: 'C' }, new Set(['old'])))
    .toEqual({ A: 'a', B: 'b', C: 'c' });
});

it('reads the A-leave receipt only after the same fixed provider is released', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'a-leave-provider-'));
  roots.push(repoRoot);
  const remoteRoot = path.join(repoRoot, '.tmp/artifacts/multi-device-sync/windows-c/run-2');
  fs.mkdirSync(remoteRoot, { recursive: true });
  fs.writeFileSync(path.join(remoteRoot, 'multi-device-sync-a-leave-receipt.json'),
    JSON.stringify({ factIds: { B: 'b', C: 'c' } }), 'utf8');
  let finishWindows;
  const reportProgress = vi.fn();
  const execute = vi.fn((_command, args, options) => {
    if (args.at(-1) === 'multi-device-sync-provider-complete') return Promise.resolve({ code: 0 });
    options.onOutput({ stdout: '[windows-dev-action] progress action=multi-device-sync-a-leave '
      + 'nonce=12345678-1234-1234-1234-123456789abc milestone=c-fact-created '
      + 'fact=multi-device-sync-c-20260813080000000\n' });
    return new Promise((resolve) => { finishWindows = () => resolve({
      code: 0, output: '[windows-dev-action] multi-device-sync-a-leave identity=run-2\n'
    }); });
  });
  const provider = startWindowsSyncGroupProvider({
    action: 'multi-device-sync-a-leave', execute, reportProgress, repoRoot
  });
  expect(reportProgress).toHaveBeenCalledWith('c-fact-created');
  provider.confirmProgress('multi-device-sync-c-20260813080000000');
  await provider.release('consumer_complete');
  finishWindows();
  await expect(provider.finish()).resolves.toMatchObject({ receipt: { factIds: { C: 'c' } } });
  expect(execute).toHaveBeenCalledWith(process.execPath, [
    'scripts/windows/windows-dev-control.mjs', 'multi-device-sync-a-leave'
  ], expect.objectContaining({ action: 'windows-c-a-leave' }));
});

it('reports a Windows provider terminal before the consumer watchdog can mask it', async () => {
  const execute = vi.fn(() => Promise.resolve({ code: 1,
    stderr: 'ssh: connect to host timed out', terminationReason: null }));
  const provider = startWindowsSyncGroupProvider({
    action: 'multi-device-sync-a-leave', execute, repoRoot: process.cwd()
  });
  await expect(provider.raceConsumer(new Promise(() => {}))).rejects.toMatchObject({
    failureOwner: 'controller', host: 'windows-c', missingFact: 'windows_a_leave_action_failed',
    message: expect.stringContaining('ssh: connect to host timed out')
  });
});

it('rejects a provider that ends successfully before its consumer is complete', async () => {
  const provider = startWindowsSyncGroupProvider({ action: 'multi-device-sync-a-leave',
    execute: vi.fn(() => Promise.resolve({ code: 0, output: '' })), repoRoot: process.cwd() });
  await expect(provider.raceConsumer(new Promise(() => {}))).rejects.toMatchObject({
    failureOwner: 'controller', host: 'windows-c',
    missingFact: 'windows_a_leave_provider_ended_early'
  });
});
