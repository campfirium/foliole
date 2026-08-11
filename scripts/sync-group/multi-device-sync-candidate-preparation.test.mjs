// @vitest-environment node
/* global process */

import fs from 'node:fs';
import path from 'node:path';
import { expect, it } from 'vitest';

import { prepareCandidate } from './multi-device-sync-candidate-preparation.mjs';

function fixture(runId) {
  const repoRoot = path.join(process.cwd(), '.tmp', 'artifacts', 'candidate-preparation-test');
  fs.mkdirSync(path.join(repoRoot, 'android/app/build/outputs/apk/debug'), { recursive: true });
  fs.writeFileSync(path.join(repoRoot, 'android/app/build/outputs/apk/debug/app-debug.apk'), runId);
  return { paths: { adb: 'fixed-adb', apk: path.join(repoRoot,
    'android/app/build/outputs/apk/debug/app-debug.apk') }, repoRoot, runId };
}

it('prepares an A/B-only candidate without invoking Windows or LAN Git control', async () => {
  const calls = [];
  const input = fixture('run-ab');
  const result = await prepareCandidate({ ...input,
    execute: async (command, args) => { calls.push([command, args]); return { stdout: '' }; },
    requiredHosts: ['macos-a', 'android-b'] });
  const receipt = JSON.parse(fs.readFileSync(result.evidenceRef, 'utf8'));
  expect(calls.some(([, args]) => args.some((arg) => arg.endsWith('windows-dev-control.mjs'))))
    .toBe(false);
  expect(receipt).toMatchObject({ preparedHosts: ['macos-a', 'android-b'], runId: 'run-ab' });
  expect(receipt).not.toHaveProperty('windowsReceipt');
});

it('resolves default host paths from the supplied repository root', async () => {
  const input = fixture('run-default-paths');
  delete input.paths;
  await expect(prepareCandidate({ ...input, requiredHosts: [] })).resolves.toMatchObject({
    progress: []
  });
});

it('prepares Windows only when the selected stage closure contains C', async () => {
  const calls = [];
  const input = fixture('run-abc');
  const execute = async (command, args) => {
    calls.push([command, args]);
    return { stdout: args.includes('multi-device-sync-candidate')
      ? '[windows-dev-action] multi-device-sync-candidate identity=test\n' : '' };
  };
  const result = await prepareCandidate({ ...input, execute,
    requiredHosts: ['macos-a', 'android-b', 'windows-c'] });
  const receipt = JSON.parse(fs.readFileSync(result.evidenceRef, 'utf8'));
  expect(calls.filter(([, args]) => args.some((arg) => arg.endsWith('windows-dev-control.mjs'))))
    .toHaveLength(1);
  expect(receipt.preparedHosts).toContain('windows-c');
  expect(receipt.windowsReceipt).toContain('multi-device-sync-candidate');
});
