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

describe('Windows Android lab dispatcher', () => {
  it('writes an isolated request and starts only the Android lab task', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'windows-android-lab-dispatch-'));
    roots.push(root);
    const calls = [];
    const paths = androidLabPaths(root);
    prepareSource(paths);
    const result = await dispatchWindowsAndroidLab({ argv: ['run', SHA], now: 1_000, paths, runCommand: (...args) => calls.push(args) });
    expect(result.state).toBe('pending');
    expect(result.protocolVersion).toBe(2);
    expect(readJson(paths.active).commitSha).toBe(SHA);
    expect(calls).toEqual([
      ['git.exe', ['--git-dir', paths.repository, 'merge-base', '--is-ancestor', SHA, 'refs/heads/lab/dev']],
      ['schtasks.exe', ['/Run', '/TN', 'FolioleAndroidLab']]
    ]);
  });

  it('keeps legacy collect and can read a previous run by its internal id', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'windows-android-lab-collect-'));
    roots.push(root);
    const paths = androidLabPaths(root);
    const latestRun = '1001-bbbbbbbbbbbb';
    const olderRun = '1000-aaaaaaaaaaaa';
    for (const [runId, summary] of [[olderRun, 'older'], [latestRun, 'latest']]) {
      const evidenceRoot = path.join(paths.evidence, runId);
      fs.mkdirSync(evidenceRoot, { recursive: true });
      fs.writeFileSync(path.join(evidenceRoot, 'summary.json'), summary);
    }
    writeJsonAtomic(paths.status, { evidenceRoot: path.join(paths.evidence, latestRun), runId: latestRun, state: 'completed' });
    const legacy = [];
    const historical = [];
    await dispatchWindowsAndroidLab({ argv: ['collect', 'get', 'summary.json'], paths, stdout: { write: (value) => legacy.push(value) } });
    await dispatchWindowsAndroidLab({
      argv: ['collect', 'get', olderRun, 'summary.json'], paths, stdout: { write: (value) => historical.push(value) }
    });
    expect(Buffer.concat(legacy).toString()).toBe('latest');
    expect(Buffer.concat(historical).toString()).toBe('older');
  });

  it('does not queue a different commit while a run is active', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'windows-android-lab-busy-'));
    roots.push(root);
    const paths = androidLabPaths(root);
    prepareSource(paths);
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(paths.status, JSON.stringify({ commitSha: SHA, state: 'running' }));
    await expect(dispatchWindowsAndroidLab({ argv: ['run', 'c'.repeat(40)], paths })).rejects.toThrow('active');
  });

  it('cancels only the recorded worker process tree', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'windows-android-lab-cancel-'));
    roots.push(root);
    const paths = androidLabPaths(root);
    prepareSource(paths);
    writeJsonAtomic(paths.status, { pid: 4321, runId: 'run-1', state: 'running' });
    const calls = [];
    const result = await dispatchWindowsAndroidLab({ argv: ['cancel'], paths, runCommand: (...args) => calls.push(args) });
    expect(calls).toEqual([['taskkill.exe', ['/PID', '4321', '/T', '/F']]]);
    expect(result.errorCode).toBe('cancelled');
  });

  it('closes stale pending state so a new commit can run', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'windows-android-lab-stale-'));
    roots.push(root);
    const paths = androidLabPaths(root);
    prepareSource(paths);
    writeJsonAtomic(paths.active, { commitSha: SHA, runId: 'stale' });
    writeJsonAtomic(paths.status, { commitSha: SHA, createdAt: new Date(0).toISOString(), runId: 'stale', state: 'pending' });
    const stale = await dispatchWindowsAndroidLab({ argv: ['status'], now: 61_000, paths });
    expect(stale).toMatchObject({ errorCode: 'worker_start_timeout', state: 'completed' });
    expect(fs.existsSync(paths.active)).toBe(false);
    const next = await dispatchWindowsAndroidLab({
      argv: ['run', 'c'.repeat(40)], now: 62_000, paths, runCommand: () => undefined
    });
    expect(next).toMatchObject({ commitSha: 'c'.repeat(40), state: 'pending' });
  });

  it('cancels pending without calling taskkill', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'windows-android-lab-pending-cancel-'));
    roots.push(root);
    const paths = androidLabPaths(root);
    writeJsonAtomic(paths.active, { runId: 'pending' });
    writeJsonAtomic(paths.status, { createdAt: new Date().toISOString(), runId: 'pending', state: 'pending' });
    const calls = [];
    const result = await dispatchWindowsAndroidLab({ argv: ['cancel'], paths, runCommand: (...args) => calls.push(args) });
    expect(result).toMatchObject({ errorCode: 'cancelled', state: 'completed' });
    expect(calls).toEqual([]);
    expect(fs.existsSync(paths.active)).toBe(false);
  });

  it('closes the request when the scheduled task cannot start', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'windows-android-lab-start-failed-'));
    roots.push(root);
    const paths = androidLabPaths(root);
    prepareSource(paths);
    await expect(dispatchWindowsAndroidLab({
      argv: ['run', SHA], now: 1_000, paths,
      runCommand: (command) => command === 'git.exe' ? { code: 0 } : { code: 1, output: 'disabled' }
    })).rejects.toMatchObject({ code: 'scheduled_task_start_failed' });
    expect(readJson(paths.status)).toMatchObject({ errorCode: 'scheduled_task_start_failed', state: 'completed' });
    expect(fs.existsSync(paths.active)).toBe(false);
  });

  it('rejects a commit that was not pushed to the fixed LAN ref', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'windows-android-lab-source-reject-'));
    roots.push(root);
    const paths = androidLabPaths(root);
    prepareSource(paths);
    await expect(dispatchWindowsAndroidLab({
      argv: ['run', SHA], paths, runCommand: () => ({ code: 1 })
    })).rejects.toMatchObject({ code: 'commit_not_in_lab_ref' });
    expect(fs.existsSync(paths.active)).toBe(false);
  });

  it('installs only a hash-verified signing identity at the fixed private path', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'windows-android-lab-signing-'));
    roots.push(root);
    const paths = androidLabPaths(root);
    prepareSource(paths);
    const payload = Buffer.from('private signing bytes');
    const sha256 = createHash('sha256').update(payload).digest('hex');
    const result = await dispatchWindowsAndroidLab({
      argv: ['signing', 'install', String(payload.length), sha256], input: payload, paths
    });
    expect(result).toEqual({ byteLength: payload.length, schemaVersion: 1, sha256, state: 'installed' });
    expect(fs.readFileSync(paths.signingKeystore)).toEqual(payload);
    expect(readJson(paths.config).androidDebugKeystoreSha256).toBe(sha256);
    await expect(dispatchWindowsAndroidLab({
      argv: ['signing', 'install', String(payload.length), '0'.repeat(64)], input: payload, paths
    })).rejects.toMatchObject({ code: 'android_signing_payload_mismatch' });
  });

  it('does not rotate signing identity while a run is active', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'windows-android-lab-signing-busy-'));
    roots.push(root);
    const paths = androidLabPaths(root);
    prepareSource(paths);
    writeJsonAtomic(paths.status, { state: 'running' });
    const payload = Buffer.from('private signing bytes');
    const sha256 = createHash('sha256').update(payload).digest('hex');
    await expect(dispatchWindowsAndroidLab({
      argv: ['signing', 'install', String(payload.length), sha256], input: payload, paths
    })).rejects.toMatchObject({ code: 'android_lab_busy' });
    expect(fs.existsSync(paths.signingKeystore)).toBe(false);
  });
});
