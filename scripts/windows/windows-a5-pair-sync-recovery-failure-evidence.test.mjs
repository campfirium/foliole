// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { expect, it, vi } from 'vitest';

import {
  collectPairSyncRecoveryFailureEvidence, PAIR_SYNC_FAILURE_DESKTOP_OVERVIEW,
  PAIR_SYNC_FAILURE_SCREENSHOT, PAIR_SYNC_FAILURE_SUMMARY
} from './windows-a5-pair-sync-recovery-failure-evidence.mjs';

it('captures the fixed A5 screen and current Windows pairing overview after recovery fails', async () => {
  const evidenceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pair-sync-failure-'));
  const execute = vi.fn(async (_command, args) => {
    if (args.includes('pull')) fs.writeFileSync(args.at(-1), 'png');
    return { code: 0, output: '', stdout: '' };
  });
  const session = {
    load: vi.fn(async () => ({ paired_authorizations: [], pending_requests: [] })),
    sanitize: vi.fn(() => ({
      pairedAuthorizationFingerprints: [], pendingAuthorizationFingerprints: []
    }))
  };
  const evidence = await collectPairSyncRecoveryFailureEvidence({
    adbPort: '5037', env: {}, evidenceRoot, error: Object.assign(new Error('secret payload'), {
      failureReason: 'initial_sync_timeout', result: { output: [
        'INSTRUMENTATION_STATUS: foliolePairSyncStage=credentials-signable',
        'INSTRUMENTATION_STATUS: foliolePairSyncEvidence={"completion":"http_200","credentials":"saved_signable","initialSync":"started"}'
      ].join('\n') }, stage: 'pair-sync-instrumentation'
    }), execute, fsApi: fs,
    paths: { adbPath: 'adb.exe' }, serial: '87a33a4b', session
  });
  expect(evidence).toEqual({
    desktopOverview: PAIR_SYNC_FAILURE_DESKTOP_OVERVIEW,
    screenshot: PAIR_SYNC_FAILURE_SCREENSHOT,
    summary: PAIR_SYNC_FAILURE_SUMMARY
  });
  expect(execute.mock.calls.every(([, args]) => args.slice(0, 4).join(' ') === '-P 5037 -s 87a33a4b')).toBe(true);
  expect(fs.existsSync(path.join(evidenceRoot, PAIR_SYNC_FAILURE_SCREENSHOT))).toBe(true);
  expect(JSON.parse(fs.readFileSync(
    path.join(evidenceRoot, PAIR_SYNC_FAILURE_DESKTOP_OVERVIEW), 'utf8'
  ))).toEqual({ pairedAuthorizationFingerprints: [], pendingAuthorizationFingerprints: [] });
  expect(JSON.parse(fs.readFileSync(path.join(evidenceRoot, PAIR_SYNC_FAILURE_SUMMARY), 'utf8')))
    .toEqual({
      android: { completion: 'http_200', credentials: 'saved_signable', initialSync: 'started' },
      convergence: null,
      hostStage: 'credentials-signable', reason: 'initial_sync_timeout',
      resultStatus: 'failure', schemaVersion: 1, stage: 'pair-sync-instrumentation'
    });
  fs.rmSync(evidenceRoot, { force: true, recursive: true });
});

it('keeps available Windows state when screenshot capture fails', async () => {
  const evidenceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pair-sync-failure-partial-'));
  const evidence = await collectPairSyncRecoveryFailureEvidence({
    adbPort: '5037', env: {}, evidenceRoot,
    error: Object.assign(new Error('private path'), { stage: 'desktop-sync-enable' }),
    execute: vi.fn(async () => ({ code: 1, output: '', stderr: 'capture failed' })), fsApi: fs,
    paths: { adbPath: 'adb.exe' }, serial: '87a33a4b',
    session: {
      load: vi.fn(async () => ({})),
      sanitize: vi.fn(() => ({ pairedAuthorizationFingerprints: [] }))
    }
  });
  expect(evidence).toEqual({
    desktopOverview: PAIR_SYNC_FAILURE_DESKTOP_OVERVIEW, summary: PAIR_SYNC_FAILURE_SUMMARY
  });
  expect(fs.readFileSync(path.join(evidenceRoot, PAIR_SYNC_FAILURE_SUMMARY), 'utf8'))
    .not.toContain('private path');
  fs.rmSync(evidenceRoot, { force: true, recursive: true });
});

it('persists a bounded post-sync dirty convergence reason', async () => {
  const evidenceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pair-sync-convergence-'));
  const readiness = {
    localMemberAuthorizationFingerprint: 'c6b193a8d1f83849', dirtyRecordCount: 1,
    missingPrerequisites: ['unsynced_device_data_requires_review'], nodeCount: 1302,
    pairingCredentialsPresent: true, pairingPeerConflict: false,
    pairingPeerAuthorizationFingerprint: '82cc2dc5c98135c8',
    resultStatus: 'approval_required', schemaVersion: 1
  };
  await collectPairSyncRecoveryFailureEvidence({
    adbPort: '5037', env: {}, evidenceRoot,
    error: Object.assign(new Error('private database detail'), {
      pairSyncAndroidEvidence: {
        completion: 'existing_pairing', credentials: 'saved_signable', initialSync: 'completed'
      },
      result: { output: `[android-data] pair-sync-recovery-readiness=${JSON.stringify(readiness)}\n` },
      stage: 'post-sync-convergence'
    }), execute: vi.fn(async () => ({ code: 1, output: '' })), fsApi: fs,
    paths: { adbPath: 'adb.exe' }, serial: '87a33a4b'
  });
  expect(JSON.parse(fs.readFileSync(path.join(evidenceRoot, PAIR_SYNC_FAILURE_SUMMARY), 'utf8')))
    .toMatchObject({
      android: { completion: 'existing_pairing', credentials: 'saved_signable', initialSync: 'completed' },
      convergence: readiness, reason: 'dirty_records_not_converged'
    });
  fs.rmSync(evidenceRoot, { force: true, recursive: true });
});
