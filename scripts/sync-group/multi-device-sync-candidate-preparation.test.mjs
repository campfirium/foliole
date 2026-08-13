// @vitest-environment node
/* global process */

import fs from 'node:fs';
import path from 'node:path';
import { expect, it } from 'vitest';

import {
  prepareCandidate, prepareCandidateStage
} from './multi-device-sync-candidate-preparation.mjs';

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
  const progress = [];
  const input = fixture('run-abc');
  const execute = async (command, args) => {
    calls.push([command, args]);
    return { stdout: args.includes('multi-device-sync-candidate')
      ? '[windows-dev-action] multi-device-sync-candidate identity=test\n' : '' };
  };
  const result = await prepareCandidate({ ...input, execute, onProgress: (value) => progress.push(value),
    requiredHosts: ['macos-a', 'android-b', 'windows-c'] });
  const receipt = JSON.parse(fs.readFileSync(result.evidenceRef, 'utf8'));
  expect(calls.filter(([, args]) => args.some((arg) => arg.endsWith('windows-dev-control.mjs'))))
    .toHaveLength(1);
  expect(receipt.preparedHosts).toContain('windows-c');
  expect(receipt.windowsReceipt).toContain('multi-device-sync-candidate');
  expect(progress).toEqual([
    'candidate-macos-started', 'candidate-macos-prepared', 'candidate-android-started',
    'candidate-android-built', 'candidate-android-installed', 'candidate-android-launched',
    'candidate-windows-started', 'candidate-windows-prepared'
  ]);
});

it('preserves the last candidate phase and command output on failure', async () => {
  const input = fixture('run-failure');
  const activities = [];
  const error = Object.assign(new Error('desktop build stopped'), { stdout: 'partial output' });
  await expect(prepareCandidateStage({ ...input, execute: async () => { throw error; },
    reportActivity: (value) => activities.push(value), reportProgress: () => {},
    requiredHosts: ['macos-a'] })).rejects.toMatchObject({
    evidenceRef: expect.stringContaining('candidate-preparation-failure.log'),
    failureOwner: 'candidate', host: 'macos-a',
    lastSuccessfulAction: 'candidate-macos-started',
    missingFact: 'candidate_preparation_completion'
  });
  expect(activities).toEqual(['candidate-macos-started']);
  expect(fs.readFileSync(error.evidenceRef, 'utf8')).toContain('partial output');
});
