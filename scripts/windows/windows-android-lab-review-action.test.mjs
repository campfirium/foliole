// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { runWindowsAndroidLabReviewPhase } from './windows-android-lab-review-action.mjs';
import { androidLabPaths, readJson, writeJsonAtomic } from './windows-android-lab-state.mjs';

const roots = [];
const SHA = 'a'.repeat(40);
const RUN = '1000-aaaaaaaaaaaa-prepare';
const ENDPOINT = '192.168.1.8:34567';

afterEach(() => roots.splice(0).forEach((root) => fs.rmSync(root, { force: true, recursive: true })));

function fixture(phase = 'prepare') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'windows-android-lab-review-'));
  roots.push(root);
  const paths = androidLabPaths(root);
  paths.preview = path.join(root, 'preview');
  paths.workspaceDeployment = path.join(paths.preview, '.foliole-android-lab-deployment.json');
  const deployment = { commitSha: SHA, deviceIdentity: 'A5-STABLE', runId: '900-aaaaaaaaaaaa', schemaVersion: 1 };
  writeJsonAtomic(paths.config, {
    adbPath: 'adb.exe', deviceIdentity: 'A5-STABLE', nodeDirectory: path.join(root, 'runtime'), schemaVersion: 2
  });
  writeJsonAtomic(paths.deployment, deployment);
  writeJsonAtomic(paths.workspaceDeployment, deployment);
  writeJsonAtomic(paths.device, { endpoint: ENDPOINT, identity: 'A5-STABLE', schemaVersion: 1 });
  for (const entry of [
    'scripts/electron-sqlite-runner.mjs', 'scripts/windows/windows-android-lab-review-audit.ts',
    'node_modules/electron/dist/electron.exe'
  ]) {
    const target = path.join(paths.preview, entry);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, 'fixture');
  }
  fs.mkdirSync(path.join(paths.preview, 'node_modules', 'better-sqlite3'), { recursive: true });
  const request = { action: 'review', commitSha: SHA, reviewPhase: phase, runId: RUN.replace('prepare', phase) };
  return { paths, request };
}

function executor(calls, audit = {}) {
  return async (command, args) => {
    calls.push({ args, command });
    if (args[0] === 'devices') return { code: 0, lines: [`${ENDPOINT} device`], output: `${ENDPOINT}\tdevice\n` };
    if (args.includes('getprop')) return { code: 0, lines: ['A5-STABLE'], output: 'A5-STABLE\n' };
    const outputIndex = args.indexOf('--output');
    if (outputIndex >= 0) {
      writeJsonAtomic(args[outputIndex + 1], {
        selected: { fsrsNodeId: 'fsrs-1', readingNodeIds: ['read-1', 'read-2', 'read-3'] }, ...audit
      });
    }
    return { code: 0, lines: [], output: '' };
  };
}

async function pullSnapshot({ destination }) {
  fs.mkdirSync(destination, { recursive: true });
  const databasePath = path.join(destination, 'review.db');
  fs.writeFileSync(databasePath, 'snapshot');
  return databasePath;
}

describe('Windows Android lab Review action', () => {
  it('binds prepare evidence and session to deployment, device, and selected objects', async () => {
    const { paths, request } = fixture();
    const calls = [];
    await runWindowsAndroidLabReviewPhase({ executeCommand: executor(calls), paths, pullSnapshot, request });
    expect(readJson(paths.reviewSession)).toMatchObject({
      commitSha: SHA, deploymentRunId: '900-aaaaaaaaaaaa', deviceIdentity: 'A5-STABLE',
      fsrsNodeId: 'fsrs-1', readingNodeIds: ['read-1', 'read-2', 'read-3']
    });
    expect(readJson(path.join(paths.evidence, request.runId, 'summary.json'))).toMatchObject({
      checkpoint: 'prepare', selectedObjectCount: 4
    });
    expect(calls.some(({ args }) => args.some((value) => String(value).endsWith('electron-sqlite-runner.mjs')))).toBe(true);
  });

  it('fails closed before device access when commit or acceptance session differs', async () => {
    const { paths, request } = fixture('capture');
    writeJsonAtomic(paths.reviewSession, {
      commitSha: 'b'.repeat(40), deploymentRunId: '900-aaaaaaaaaaaa', deviceIdentity: 'A5-STABLE',
      fsrsNodeId: 'fsrs-1', readingNodeIds: ['read-1', 'read-2', 'read-3']
    });
    const calls = [];
    await expect(runWindowsAndroidLabReviewPhase({
      executeCommand: executor(calls), paths, pullSnapshot, request
    })).rejects.toMatchObject({ code: 'review_session_commit_mismatch' });
    expect(calls).toEqual([]);
  });

  it('runs restart in fixed force-stop, reverse, launch, verify order before audit', async () => {
    const { paths, request } = fixture('restart');
    writeJsonAtomic(paths.reviewSession, {
      commitSha: SHA, deploymentRunId: '900-aaaaaaaaaaaa', deviceIdentity: 'A5-STABLE',
      fsrsNodeId: 'fsrs-1', readingNodeIds: ['read-1', 'read-2', 'read-3']
    });
    const calls = [];
    await runWindowsAndroidLabReviewPhase({ executeCommand: executor(calls), paths, pullSnapshot, request });
    const operations = calls.map(({ args }) => args.join(' '));
    expect(operations.findIndex((value) => value.includes('force-stop')))
      .toBeLessThan(operations.findIndex((value) => value.includes('reverse tcp:38641')));
    expect(operations.findIndex((value) => value.includes('reverse tcp:38641')))
      .toBeLessThan(operations.findIndex((value) => value.includes('am start')));
    expect(operations.findIndex((value) => value.includes('am start')))
      .toBeLessThan(operations.findIndex((value) => value.includes('verify-android-launch.mjs')));
  });

  it('does not fall back to bare Node when the deployed Electron ABI runtime is absent', async () => {
    const { paths, request } = fixture();
    fs.rmSync(path.join(paths.preview, 'node_modules', 'better-sqlite3'), { recursive: true });
    await expect(runWindowsAndroidLabReviewPhase({
      executeCommand: executor([]), paths, pullSnapshot, request
    })).rejects.toMatchObject({ code: 'review_audit_runtime_missing' });
  });
});
