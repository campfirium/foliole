// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  createLifecycleBuildEnv,
  sanitizeIosAcceptanceEnv
} from './ios-foreground-sync-lifecycle-build.mjs';
import {
  createDedicatedSimulatorArgs,
  dedicatedSimulatorCleanupArgs,
  selectDedicatedIphoneTemplate
} from './ios-dedicated-simulator.mjs';
import {
  parseForegroundSyncLifecycleSnapshot,
  RECOVERED_RESUME_ADMISSION_TIMEOUT_MS,
  RECOVERED_RESUME_SETTLEMENT_TIMEOUT_MS,
  verifyForegroundSyncLifecycleAcceptance,
  waitForRecoveredResumeRequest
} from './ios-foreground-sync-lifecycle-snapshot.mjs';
import { hostedProviderRegistrationEvidence } from './ios-hosted-provider-test-evidence.mjs';
import {
  createIosForegroundSyncLifecycleObservations,
  createIosForegroundSyncLifecycleService
} from './ios-foreground-sync-lifecycle-service.ts';

const finishedEvent = JSON.stringify([
  { kind: 'run_finished', occurred_at: '2026-07-22T00:00:00.000Z', result: 'synced', run_id: 'run-1', status: 'completed' },
  { kind: 'run_finished', occurred_at: '2026-07-21T00:00:00.000Z', result: 'failed', run_id: 'older', status: 'completed' }
]);
const snapshotRows = JSON.stringify([
  { key: 'device_id', value: 'ios-device' },
  { key: 'workspace_sync_endpoint_url', value: 'http://127.0.0.1:1' },
  { key: 'workspace_sync_last_synced_at', value: '2026-07-22T00:00:00.000Z' },
  { key: 'workspace_sync_events', value: finishedEvent },
  { key: 'sync_pack_cursor', value: '2' }
]);

function recoveredObservation(status = null, overrides = {}) {
  const request = status ? [{ finished_at: status === 'running' ? null : '2026-07-22T00:00:02.000Z',
    phase: 'recovered-resume', started_at: '2026-07-22T00:00:01.000Z', status }] : [];
  return { foreground_sync_lifecycle: { active_requests: status === 'running' ? 1 : 0,
    max_concurrency: status ? 1 : 0, phase_requests: { 'recovered-resume': request.length },
    requests: request, ...overrides } };
}

function stagedObservationWait(stages, timeouts = []) {
  return async (options) => {
    timeouts.push(options.timeoutMs);
    const values = stages.shift();
    for (const value of values) if (options.accept(value)) return value;
    throw new Error(`Timed out waiting for ${options.label}: ${options.describe(values.at(-1))}`);
  };
}

describe('iOS foreground sync lifecycle acceptance', () => {
  it('keeps the shell and lifecycle evidence behind the exclusive acceptance gate', () => {
    const entry = fs.readFileSync('src/companion/main.tsx', 'utf8');
    const runner = fs.readFileSync('scripts/ios/ios-foreground-sync-lifecycle-runner.mjs', 'utf8');
    const shell = fs.readFileSync('src/companion/iosForegroundSyncLifecycleAcceptance.tsx', 'utf8');
    const state = fs.readFileSync('scripts/ios/ios-foreground-sync-lifecycle-state.mjs', 'utf8');
    expect(entry).toContain("iosAcceptanceScenario === 'foreground-sync-lifecycle'");
    expect(entry).toMatch(/if \(isIosBridgeAcceptance\)[\s\S]*else[\s\S]*<CompanionApp/);
    expect(shell).toContain('useCompanionWorkspaceSync(bootstrap)');
    expect(shell).toContain('ensureIosAcceptanceSyncGroup(bootstrap.database_path)');
    expect(shell).toContain('workspaceSync.state.last_synced_at === null');
    expect(shell).toContain("workspaceSync.status !== 'idle'");
    expect(shell).toContain('readyPosted.current = true');
    expect(shell).toContain('postReady(workspaceSync)');
    expect(shell).not.toContain('workspaceSync.pullFromDesktop(');
    expect(runner).toContain("waitForForegroundSyncRequestPhase(options, 'endpoint-ready', 1)");
    expect(runner).toContain('waitForForegroundSyncLifecycleRunCompletion');
    expect(state).toContain('RUN_SETTLEMENT_TIMEOUT_MS = 120_000');
    expect(shell).toContain("App.addListener('pause'");
    expect(shell).not.toContain('createForegroundSyncRunner');
    expect(shell).not.toContain('tryForegroundAutoSync');
    expect(runner.match(/shell readiness', 60_000/g)).toHaveLength(2);
    expect(runner).toContain('timeoutMs = 20_000');
    expect(runner).toContain("value?.status === 'failed'");
    expect(runner).toContain("throw new Error(value.error || `${label} failed`)");
    expect(runner).toMatch(/terminate[^\n]+com\.apple\.Preferences[^\n]+\n[^\n]+launch[^\n]+com\.apple\.Preferences/);
    expect(state).toContain("FROM sync_peer_cursors");
    expect(state).toContain("stream_name = 'sync-pack-receive'");
  });

  it('sanitizes ordinary assets and enables only the reviewed lifecycle scenario', () => {
    const ambient = { KEEP: 'yes', VITE_FOLIOLE_IOS_BRIDGE_ACCEPTANCE_SCENARIO: 'ambient' };
    expect(sanitizeIosAcceptanceEnv(ambient)).toEqual({ KEEP: 'yes' });
    expect(createLifecycleBuildEnv(ambient)).toMatchObject({
      KEEP: 'yes',
      VITE_FOLIOLE_IOS_BRIDGE_ACCEPTANCE: '1',
      VITE_FOLIOLE_IOS_BRIDGE_ACCEPTANCE_SCENARIO: 'foreground-sync-lifecycle'
    });
  });

  it('creates and deletes only a recorded dedicated iPhone Simulator', () => {
    const template = selectDedicatedIphoneTemplate({ devices: { 'runtime-ios': [],
      'com.apple.CoreSimulator.SimRuntime.iOS-26-5': [{
        deviceTypeIdentifier: 'type-17-pro', isAvailable: true, name: 'iPhone 17 Pro'
      }] } });
    expect(createDedicatedSimulatorArgs(template, 'Owned')).toEqual([
      'simctl', 'create', 'Owned', 'type-17-pro', 'com.apple.CoreSimulator.SimRuntime.iOS-26-5'
    ]);
    expect(dedicatedSimulatorCleanupArgs('OWNED')).toEqual({
      delete: ['simctl', 'delete', 'OWNED'], shutdown: ['simctl', 'shutdown', 'OWNED']
    });
    expect(selectDedicatedIphoneTemplate({ devices: { 'com.apple.CoreSimulator.SimRuntime.iOS-26-5': [
      { deviceTypeIdentifier: 'type-17-pro', isAvailable: true, name: 'iPhone 17 Pro', state: 'Shutdown' },
      { deviceTypeIdentifier: 'type-16', isAvailable: true, name: 'iPhone 16', state: 'Booted' }
    ] } })).toMatchObject({ deviceTypeIdentifier: 'type-16' });
  });

  it('holds one canonical sync pass and fails only the controlled phase', async () => {
    const artifactDir = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-ios-lifecycle-'));
    const observations = createIosForegroundSyncLifecycleObservations();
    const route = createIosForegroundSyncLifecycleService({
      artifactDir, observations,
      route: async () => ({ body: 'pack', contentType: 'application/vnd.foliole.sync-pack' })
    });
    fs.writeFileSync(path.join(artifactDir, 'lifecycle-control.json'), '{"phase":"failed-resume"}\n');
    await expect(route({ bodyText: '', method: 'GET', url: '/companion/sync-pack?after_state_seq=0' }))
      .resolves.toMatchObject({ status: 503 });
    expect(observations).toMatchObject({ active_requests: 0, failed_requests: 1, max_concurrency: 1,
      phase_requests: { 'failed-resume': 1 }, request_count: 1 });
  });

  it('gives a late admitted recovered request its own bounded settlement window', async () => {
    const timeouts = [];
    const waitForObservation = stagedObservationWait([
      [recoveredObservation(), recoveredObservation('running')],
      [recoveredObservation('running'), recoveredObservation('passed')]
    ], timeouts);
    await expect(waitForRecoveredResumeRequest({ read: () => null, waitForObservation })).resolves.toBeTruthy();
    expect(timeouts).toEqual([RECOVERED_RESUME_ADMISSION_TIMEOUT_MS, RECOVERED_RESUME_SETTLEMENT_TIMEOUT_MS]);
  });

  it('fails when recovered request admission or settlement never reaches its bounded condition', async () => {
    await expect(waitForRecoveredResumeRequest({ read: () => null,
      waitForObservation: stagedObservationWait([[recoveredObservation()]]) }))
      .rejects.toThrow('recovered-resume request admission');
    await expect(waitForRecoveredResumeRequest({ read: () => null,
      waitForObservation: stagedObservationWait([[recoveredObservation('running')], [recoveredObservation('running')]]) }))
      .rejects.toThrow('recovered-resume request settlement');
  });

  it.each([
    ['terminal failure', recoveredObservation('failed')],
    ['an extra request', recoveredObservation('passed', { phase_requests: { 'recovered-resume': 2 },
      requests: [...recoveredObservation('passed').foreground_sync_lifecycle.requests,
        { finished_at: null, phase: 'recovered-resume', started_at: 'later', status: 'running' }] })],
    ['concurrency above one', recoveredObservation('passed', { max_concurrency: 2 })]
  ])('fails recovered settlement on %s', async (_label, terminal) => {
    await expect(waitForRecoveredResumeRequest({ read: () => null,
      waitForObservation: stagedObservationWait([[recoveredObservation('running')], [terminal]]) }))
      .rejects.toThrow('did not settle as one passed request');
  });

  it('accepts suspended or opportunistic background retry with exact counts and stable restart state', () => {
    const snapshot = parseForegroundSyncLifecycleSnapshot(snapshotRows);
    expect(snapshot.latestFinished).toMatchObject({ runId: 'run-1', result: 'synced' });
    expect(snapshot.finishedRuns.map((run) => run.runId)).toEqual(['run-1', 'older']);
    const phase_requests = Object.fromEntries([
      'endpoint-ready', 'resume-single-flight', 'failed-resume', 'recovered-resume', 'restart'
    ].map((phase) => [phase, 1]));
    const registration = hostedProviderRegistrationEvidence();
    const observations = { registration, foreground_sync_lifecycle: {
      active_requests: 0, completed_requests: 4, failed_requests: 1, max_concurrency: 1,
      phase_requests, request_count: 5, requests: []
    } };
    expect(verifyForegroundSyncLifecycleAcceptance({
      afterRestart: snapshot, backgroundDeltas: [0, 0, 0], beforeRestart: snapshot,
      lifecycle: { active_count: 2, pause_count: 3, resume_count: 2 }, observations
    })).toMatchObject({ background_request_deltas: [0, 0, 0], background_retry_request_count: 0 });
    const opportunistic = { registration, foreground_sync_lifecycle: {
      ...observations.foreground_sync_lifecycle,
      failed_requests: 2,
      phase_requests: { ...phase_requests, 'failed-resume': 2 },
      request_count: 6
    } };
    expect(verifyForegroundSyncLifecycleAcceptance({
      afterRestart: snapshot, backgroundDeltas: [0, 0, 1], beforeRestart: snapshot,
      lifecycle: { active_count: 2, pause_count: 3, resume_count: 2 }, observations: opportunistic
    })).toMatchObject({ background_retry_request_count: 1 });
    const restartDoubleActive = { registration, foreground_sync_lifecycle: {
      ...observations.foreground_sync_lifecycle,
      completed_requests: 5,
      phase_requests: { ...phase_requests, restart: 2 },
      request_count: 6
    } };
    expect(verifyForegroundSyncLifecycleAcceptance({
      afterRestart: snapshot, backgroundDeltas: [0, 0, 0], beforeRestart: snapshot,
      lifecycle: { active_count: 3, pause_count: 3, resume_count: 3 }, observations: restartDoubleActive
    })).toMatchObject({ restart_extra_request_count: 1 });
    const partialFinished = { result: 'partial', runId: 'run-2', status: 'skipped' };
    const partialSnapshot = { ...snapshot, finishedRuns: [partialFinished], latestFinished: partialFinished };
    expect(verifyForegroundSyncLifecycleAcceptance({
      afterRestart: partialSnapshot, backgroundDeltas: [0, 0, 0], beforeRestart: partialSnapshot,
      lifecycle: { active_count: 2, pause_count: 2, resume_count: 2 }, observations
    })).toMatchObject({ after_restart: partialSnapshot });
    expect(() => verifyForegroundSyncLifecycleAcceptance({
      afterRestart: { ...snapshot, cursor: null }, backgroundDeltas: [0, 0, 0], beforeRestart: snapshot,
      lifecycle: { active_count: 2, pause_count: 2, resume_count: 2 }, observations
    })).toThrow('evidence is incomplete');
    for (const backgroundDeltas of [[1, 0, 0], [0, 1, 0], [0, 0, 2]]) {
      expect(() => verifyForegroundSyncLifecycleAcceptance({
        afterRestart: snapshot, backgroundDeltas, beforeRestart: snapshot,
        lifecycle: { active_count: 2, pause_count: 2, resume_count: 2 }, observations
      })).toThrow('evidence is incomplete');
    }
    expect(() => verifyForegroundSyncLifecycleAcceptance({
      afterRestart: snapshot, backgroundDeltas: [0, 0, 0], beforeRestart: snapshot,
      lifecycle: { active_count: 2, pause_count: 2, resume_count: 2 },
      observations: { registration, foreground_sync_lifecycle: {
        ...observations.foreground_sync_lifecycle, max_concurrency: 2
      } }
    })).toThrow('evidence is incomplete');
  });
});
