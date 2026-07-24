// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';

import { devicePaths, readJson, writeJsonAtomic } from './windows-device-state.mjs';
import { runWindowsDeviceWorker } from './windows-device-worker.mjs';

it('downloads on Windows and delegates the full execution to the 060 runner', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-device-worker-'));
  const paths = devicePaths(root);
  const request = { commitSha: 'a'.repeat(40), runId: '10', schemaVersion: 1 };
  writeJsonAtomic(paths.active, request);
  fs.writeFileSync(paths.githubToken, 'read-token');
  const calls = [];
  await runWindowsDeviceWorker({
    downloadArtifactImpl: async () => {},
    executeCommand: async (command, args) => { calls.push([command, args]); return { code: 0, output: '[windows-validation-kit] status: SUCCESS evidence=C:\\evidence\n' }; },
    extractArtifactImpl: async () => 'C:\\kit',
    paths,
    platform: 'win32',
    resolveArtifactImpl: async (_request, options) => { expect(options.token).toBe('read-token'); return { id: 1, runAttempt: '2' }; }
  });
  expect(calls[0][1].some((value) => value.endsWith('windows-validation-kit-runner.mjs'))).toBe(true);
  expect(calls[0][1]).toContain('run');
  expect(readJson(paths.status)).toMatchObject({ evidenceRoot: 'C:\\evidence', resultStatus: 'success', state: 'completed' });
});

it('persists a bounded scheduled-task error for remote diagnosis', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-device-worker-error-'));
  const paths = devicePaths(root);
  writeJsonAtomic(paths.active, { commitSha: 'b'.repeat(40), runId: '11', schemaVersion: 1 });
  fs.writeFileSync(paths.githubToken, 'read-token');
  await expect(runWindowsDeviceWorker({
    paths, platform: 'win32', resolveArtifactImpl: async () => { throw Object.assign(new Error('archive rejected'), { code: 'artifact_rejected' }); }
  })).rejects.toThrow('archive rejected');
  expect(readJson(paths.status)).toMatchObject({ errorCode: 'artifact_rejected', errorMessage: 'archive rejected' });
  expect(fs.readFileSync(path.join(root, 'worker-error.log'), 'utf8')).toContain('artifact_rejected: archive rejected');
});

it('preserves collectable candidate evidence when the validation runner times out', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-device-worker-timeout-'));
  const paths = devicePaths(root);
  const request = { commitSha: 'c'.repeat(40), runId: '12', schemaVersion: 1 };
  writeJsonAtomic(paths.active, request);
  fs.writeFileSync(paths.githubToken, 'read-token');
  await expect(runWindowsDeviceWorker({
    downloadArtifactImpl: async () => {},
    executeCommand: async (_command, _args, options) => {
      expect(options).toMatchObject({ timeoutCode: 'validation_kit_timeout', timeoutMs: 2_100_000 });
      throw Object.assign(new Error('runner timed out'), { code: 'validation_kit_timeout' });
    },
    extractArtifactImpl: async () => 'C:\\kit',
    paths,
    platform: 'win32',
    resolveArtifactImpl: async () => ({ runAttempt: '3' })
  })).rejects.toMatchObject({ code: 'validation_kit_timeout' });
  expect(readJson(paths.status)).toMatchObject({
    errorCode: 'validation_kit_timeout',
    evidenceRoot: path.join(root, 'validation-results', 'candidate', `${'c'.repeat(12)}-12-3`),
    resultStatus: 'failure',
    state: 'completed'
  });
});
