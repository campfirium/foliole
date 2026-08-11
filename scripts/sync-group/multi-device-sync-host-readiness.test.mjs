import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';

import { createHostReadinessAdapters } from './multi-device-sync-host-readiness.mjs';
import { createIsolatedMacosRoot } from './multi-device-sync-workspace.mjs';

it('uses explicit A5 serial and a registered Windows action', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'multi-device-hosts-'));
  fs.mkdirSync(path.join(repoRoot, 'node_modules/.bin'), { recursive: true });
  fs.writeFileSync(path.join(repoRoot, 'node_modules/.bin/cap'), '');
  createIsolatedMacosRoot({ repoRoot, runId: 'run-1' });
  const calls = [];
  const execute = async (command, args) => {
    calls.push([command, args]);
    if (args.includes('devices')) return '87a33a4b               device product:test\n';
    if (args.includes('dumpsys')) {
      return '  mCurrentFocus=Window{1 u0 com.foliole.android/.MainActivity}\n';
    }
    if (command === 'ssh') return '[multi-device-sync-readiness] status=ready\n';
    return '';
  };
  const adapters = createHostReadinessAdapters({ execute, repoRoot, runId: 'run-1' });
  await adapters['android-b']();
  await adapters['windows-c']();
  expect(calls.some(([, args]) => args.includes('87a33a4b'))).toBe(true);
  expect(calls.some(([, args]) => args.includes('wait-for-device'))).toBe(true);
  expect(calls.find(([command]) => command === 'ssh')[1].join(' '))
    .toContain('windows-multi-device-sync-readiness.mjs');
  expect(calls.find(([command]) => command === 'ssh')[1]).toContain('C:/Progra~1/nodejs/node.exe');
});

it('blocks Android readiness before mutation when Foliole lacks window focus', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'multi-device-hosts-'));
  fs.mkdirSync(path.join(repoRoot, 'node_modules/.bin'), { recursive: true });
  fs.writeFileSync(path.join(repoRoot, 'node_modules/.bin/cap'), '');
  createIsolatedMacosRoot({ repoRoot, runId: 'run-2' });
  const execute = async (_command, args) => {
    if (args.includes('devices')) return '87a33a4b device product:test\n';
    if (args.includes('dumpsys')) return 'mCurrentFocus=Window{2 u0 com.android.systemui/.keyguard}\n';
    return '';
  };
  const adapters = createHostReadinessAdapters({ execute, repoRoot, runId: 'run-2' });
  await expect(adapters['android-b']()).rejects.toMatchObject({
    lastSuccessfulAction: 'android_activity_started',
    missingFact: 'android_app_window_focus_missing'
  });
});
