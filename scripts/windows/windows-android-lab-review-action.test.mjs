// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  finishWindowsAndroidLabReviewRun, runWindowsAndroidLabReviewPhase
} from './windows-android-lab-review-action.mjs';
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

function executor(calls, audit = {}, auditExitCode = 0) {
  return async (command, args) => {
    calls.push({ args, command });
    if (args[0] === 'devices') return { code: 0, lines: [`${ENDPOINT} device`], output: `${ENDPOINT}\tdevice\n` };
    if (args.includes('getprop')) return { code: 0, lines: ['A5-STABLE'], output: 'A5-STABLE\n' };
    const outputIndex = args.indexOf('--output');
    if (outputIndex >= 0) {
      writeJsonAtomic(args[outputIndex + 1], {
        acceptance: { status: 'available' }, resultStatus: auditExitCode ? 'failure' : 'success',
        current: {
          fsrs: { nodeId: 'fsrs-1' },
          reading: ['read-1', 'read-2', 'read-3'].map((nodeId) => ({ nodeId })),
          schedulerVersion: 'ts-fsrs@test'
        },
        selected: { fsrsNodeId: 'fsrs-1', readingNodeIds: ['read-1', 'read-2', 'read-3'] }, ...audit
      });
      return { code: auditExitCode, lines: [], output: '' };
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
      baseline: { fsrs: { nodeId: 'fsrs-1' } },
      commitSha: SHA, deploymentRunId: '900-aaaaaaaaaaaa', deviceIdentity: 'A5-STABLE',
      expectedActions: [
        { action: 'grade', nodeId: 'fsrs-1' }, { action: 'read', nodeId: 'read-1' },
        { action: 'later', nodeId: 'read-2' }, { action: 'dismiss', nodeId: 'read-3' }
      ],
      fsrsNodeId: 'fsrs-1', readingNodeIds: ['read-1', 'read-2', 'read-3']
    });
    expect(readJson(path.join(paths.evidence, request.runId, 'summary.json'))).toMatchObject({
      checkpoint: 'prepare', selectedObjectCount: 4
    });
    expect(calls.some(({ args }) => args.some((value) => String(value).endsWith('electron-sqlite-runner.mjs')))).toBe(true);
  });

  it('force-stops before snapshot capture and relaunches before database audit', async () => {
    const { paths, request } = fixture();
    const events = [];
    const executeCommand = async (...args) => {
      events.push(args[1].join(' '));
      return executor([])(...args);
    };
    const stoppedSnapshot = async (args) => {
      expect(args.appStopped).toBe(true);
      expect(events.at(-1)).toContain('am force-stop');
      events.push('snapshot');
      return pullSnapshot(args);
    };
    await runWindowsAndroidLabReviewPhase({ executeCommand, paths, pullSnapshot: stoppedSnapshot, request });
    expect(events.findIndex((value) => value === 'snapshot'))
      .toBeLessThan(events.findIndex((value) => value.includes('am start')));
    expect(events.findIndex((value) => value.includes('am start')))
      .toBeLessThan(events.findIndex((value) => value.includes('electron-sqlite-runner.mjs')));
  });

  it('persists the successful capture state for restart comparison', async () => {
    const { paths, request } = fixture('capture');
    writeJsonAtomic(paths.reviewSession, {
      baseline: { fsrs: { nodeId: 'fsrs-1' }, reading: [], schedulerVersion: 'before' },
      commitSha: SHA, deploymentRunId: '900-aaaaaaaaaaaa', deviceIdentity: 'A5-STABLE',
      expectedActions: [], fsrsNodeId: 'fsrs-1', readingNodeIds: ['read-1', 'read-2', 'read-3']
    });
    await runWindowsAndroidLabReviewPhase({ executeCommand: executor([]), paths, pullSnapshot, request });
    expect(readJson(paths.reviewSession)).toMatchObject({
      captureRunId: request.runId, captured: { fsrs: { nodeId: 'fsrs-1' }, schedulerVersion: 'ts-fsrs@test' }
    });
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

  it('keeps a missing-scheduler audit collectable while preserving a nonzero phase failure', async () => {
    const { paths, request } = fixture();
    const executeCommand = executor([], {
      pairing: { status: 'available', value: { endpointUrl: 'http://127.0.0.1:38641', target: 'windows_executor' } },
      errorCode: 'review_scheduler_settings_missing',
      scheduler: { error: 'review scheduler settings are missing', status: 'missing' },
      sync: { status: 'available', value: { reviewLogPushCursor: null } }
    }, 1);
    await expect(runWindowsAndroidLabReviewPhase({ executeCommand, paths, pullSnapshot, request }))
      .rejects.toMatchObject({ code: 'review_scheduler_settings_missing' });
    expect(readJson(path.join(paths.evidence, request.runId, 'review-audit.json'))).toMatchObject({
      resultStatus: 'failure', scheduler: { status: 'missing' }, sync: { status: 'available' }
    });
    expect(fs.existsSync(path.join(paths.evidence, request.runId, 'runner.log'))).toBe(true);
  });

  it('writes a run-scoped failure audit when a Review phase fails before database audit', async () => {
    const { paths, request } = fixture('capture');
    const running = { ...request, evidenceRoot: path.join(paths.evidence, request.runId), state: 'running' };
    await expect(finishWindowsAndroidLabReviewRun({
      executeCommand: executor([]), paths, request, running,
      runReviewPhase: async () => { throw Object.assign(new Error('review prepare must complete'), { code: 'review_session_missing' }); }
    })).rejects.toMatchObject({ code: 'review_session_missing' });
    expect(readJson(path.join(paths.evidence, request.runId, 'review-audit.json'))).toMatchObject({
      checkpoint: 'capture', errorCode: 'review_session_missing', resultStatus: 'failure',
      scheduler: { status: 'unavailable' }
    });
    expect(readJson(path.join(paths.evidence, request.runId, 'summary.json'))).toMatchObject({ resultStatus: 'failure' });
  });
});
