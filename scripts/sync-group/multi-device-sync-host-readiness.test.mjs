import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';

import {
  createHostReadinessAdapters, createMutationReadinessAdapters
} from './multi-device-sync-host-readiness.mjs';
import { createIsolatedMacosRoot } from './multi-device-sync-workspace.mjs';

it('uses explicit A5 serial and a registered Windows action', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'multi-device-hosts-'));
  fs.mkdirSync(path.join(repoRoot, 'node_modules/.bin'), { recursive: true });
  fs.writeFileSync(path.join(repoRoot, 'node_modules/.bin/cap'), '');
  createIsolatedMacosRoot({ repoRoot, runId: 'run-1' });
  const calls = [];
  const launchCalls = [];
  const execute = async (command, args) => {
    calls.push([command, args]);
    if (args.includes('devices')) return '87a33a4b               device product:test\n';
    if (command === 'ssh') return '[multi-device-sync-readiness] status=ready\n';
    return '';
  };
  const verifyLaunch = async (options) => {
    launchCalls.push(options);
    return { ok: true, state: { focusedWindow: 'com.foliole.android/.MainActivity',
      topActivity: 'com.foliole.android/.MainActivity' } };
  };
  const adapters = createHostReadinessAdapters({ execute, repoRoot, runId: 'run-1', verifyLaunch });
  await adapters['android-b']();
  await adapters['windows-c']();
  expect(calls.some(([, args]) => args.includes('87a33a4b'))).toBe(true);
  expect(calls.some(([, args]) => args.includes('wait-for-device'))).toBe(true);
  expect(calls.find(([command]) => command === 'ssh')[1].join(' '))
    .toContain('windows-multi-device-sync-readiness.mjs');
  expect(calls.find(([command]) => command === 'ssh')[1]).toContain('C:/Progra~1/nodejs/node.exe');
  expect(launchCalls).toEqual([expect.objectContaining({ appId: 'com.foliole.android',
    serial: '87a33a4b', stabilitySeconds: 2, timeoutSeconds: 10 })]);
});

it('blocks Android readiness before mutation when Foliole lacks window focus', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'multi-device-hosts-'));
  fs.mkdirSync(path.join(repoRoot, 'node_modules/.bin'), { recursive: true });
  fs.writeFileSync(path.join(repoRoot, 'node_modules/.bin/cap'), '');
  createIsolatedMacosRoot({ repoRoot, runId: 'run-2' });
  const execute = async (_command, args) => {
    if (args.includes('devices')) return '87a33a4b device product:test\n';
    return '';
  };
  const verifyLaunch = async () => ({ ok: false,
    state: { focusedWindow: 'com.android.systemui/.keyguard', topActivity: null } });
  const adapters = createHostReadinessAdapters({ execute, repoRoot, runId: 'run-2', verifyLaunch });
  await expect(adapters['android-b']()).rejects.toMatchObject({
    lastSuccessfulAction: 'android_activity_started',
    missingFact: 'android_app_window_focus_missing'
  });
});

it('does not require a Windows candidate receipt for an A/B-only target', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'multi-device-hosts-'));
  const runId = 'run-ab-only';
  const receiptRoot = path.join(repoRoot, '.tmp/artifacts/multi-device-sync/runs', runId);
  fs.mkdirSync(receiptRoot, { recursive: true });
  fs.writeFileSync(path.join(receiptRoot, 'candidate-preparation.json'), JSON.stringify({
    preparedHosts: ['macos-a', 'android-b'], resultStatus: 'success', runId
  }));
  const execute = async (command) => command === 'ssh'
    ? '[multi-device-sync-readiness] status=ready\n' : '';
  const adapters = createMutationReadinessAdapters({ execute, repoRoot,
    requiredHosts: ['macos-a', 'android-b'], runId });
  await expect(adapters['windows-c']()).resolves.toMatchObject({
    facts: expect.arrayContaining(['windows-c_candidate_not_required'])
  });
});
