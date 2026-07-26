// @vitest-environment node

import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { dispatchWindowsAndroidLab } from './windows-android-lab-dispatcher.mjs';
import { androidLabPaths, readJson, writeJsonAtomic } from './windows-android-lab-state.mjs';

const roots = [];
const SHA = 'b'.repeat(40);
afterEach(() => roots.splice(0).forEach((root) => fs.rmSync(root, { force: true, recursive: true })));

function prepareSource(paths) {
  fs.mkdirSync(paths.repository, { recursive: true });
  fs.writeFileSync(path.join(paths.repository, 'HEAD'), 'ref: refs/heads/lab/dev\n');
  writeJsonAtomic(paths.config, { deviceIdentity: 'A5-STABLE', gitPath: 'git.exe', schemaVersion: 2 });
}

function requestPayload(overrides = {}) {
  const value = {
    commitSha: SHA, cwd: { path: '', scope: 'checkout' }, mode: 'automation',
    operation: { args: [], kind: 'repository', runner: 'scripts/windows/windows-native-check.mjs' },
    requestId: 'repo-check', schemaVersion: 1, target: 'windows', timeoutMs: 30_000, ...overrides
  };
  const payload = Buffer.from(`${JSON.stringify(value)}\n`);
  return { payload, sha256: createHash('sha256').update(payload).digest('hex') };
}

describe('Windows Android lab general request dispatch', () => {
  it('validates and atomically claims a hashed request before starting the worker', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'windows-android-lab-request-dispatch-'));
    roots.push(root);
    const paths = androidLabPaths(root);
    prepareSource(paths);
    const request = requestPayload();
    const calls = [];
    const result = await dispatchWindowsAndroidLab({
      argv: ['request', String(request.payload.length), request.sha256], input: request.payload,
      now: 3_000, paths, runCommand: (...args) => { calls.push(args); return { code: 0, output: '' }; }
    });
    expect(result).toMatchObject({ mode: 'automation', requestId: 'repo-check', state: 'pending', target: 'windows' });
    expect(readJson(paths.active)).toMatchObject({ action: 'request', requestId: 'repo-check', requestSha256: request.sha256 });
    expect(calls.at(-1)).toEqual(['schtasks.exe', ['/Run', '/TN', 'FolioleAndroidLab']]);
  });

  it('allows only one concurrent request to claim the worker slot', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'windows-android-lab-atomic-claim-'));
    roots.push(root);
    const paths = androidLabPaths(root);
    prepareSource(paths);
    const first = requestPayload({ requestId: 'first' });
    const second = requestPayload({ requestId: 'second' });
    const runCommand = () => ({ code: 0, output: '' });
    const results = await Promise.allSettled([
      dispatchWindowsAndroidLab({ argv: ['request', String(first.payload.length), first.sha256], input: first.payload, paths, runCommand }),
      dispatchWindowsAndroidLab({ argv: ['request', String(second.payload.length), second.sha256], input: second.payload, paths, runCommand })
    ]);
    expect(results.map((result) => result.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect(results.find((result) => result.status === 'rejected').reason).toMatchObject({ code: 'android_lab_busy' });
  });

  it('does not execute legacy device reconnect in the dispatcher', async () => {
    const paths = androidLabPaths(fs.mkdtempSync(path.join(os.tmpdir(), 'windows-android-lab-reconnect-')));
    roots.push(paths.root);
    const calls = [];
    await expect(dispatchWindowsAndroidLab({
      argv: ['device', 'reconnect', '192.168.0.107:38717'], paths,
      runCommand: (...args) => calls.push(args)
    })).rejects.toMatchObject({ code: 'device_reconnect_requires_request' });
    expect(calls).toEqual([]);
  });
});
