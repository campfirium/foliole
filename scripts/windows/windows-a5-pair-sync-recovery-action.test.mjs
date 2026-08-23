// @vitest-environment node

import { Buffer } from 'node:buffer';
import fs from 'node:fs';

import { expect, it, vi } from 'vitest';

import {
  inspectWindowsPairSyncRecoveryDesktop, runWindowsA5PairSyncRecovery
} from './windows-a5-pair-sync-recovery-action.mjs';
import {
  createPairSyncRecoveryWindow, PAIR_SYNC_RECOVERY_TIMEOUT_MS, resolvePairSyncConcurrentFailure,
  waitForPairRequestWhileInstrumentationRuns
} from '../sync-group/pair-sync-concurrency.mjs';
import { assertPairSyncRuntimeOwnership } from '../sync-group/pair-sync-transport.mjs';
import { pairSyncAuthorizationFingerprint } from './windows-pair-sync-desktop-session.mjs';

const paths = { repoRoot: 'C:\\repo', systemNode: 'C:\\Program Files\\nodejs\\node.exe' };
const execute = vi.fn(async () => ({ code: 0, output: '', stdout: '' }));

it('wires pending observation, approval invocation, and approval success in order', () => {
  const source = fs.readFileSync('scripts/sync-group/pair-sync-feature-result.mjs', 'utf8');
  const action = fs.readFileSync('scripts/sync-group/pair-sync-feature-journey.mjs', 'utf8');
  const observed = source.indexOf('approval.markPendingObserved()');
  const invoked = source.indexOf('approval.markApproveInvoked()');
  const approved = source.indexOf('approval.markApproveSucceeded()');
  expect(observed).toBeGreaterThan(-1);
  expect(observed).toBeLessThan(invoked);
  expect(invoked).toBeLessThan(source.indexOf('session.approve(', invoked));
  expect(source.indexOf('session.approve(', invoked)).toBeLessThan(approved);
  expect(action).toContain('approvalRequired\n      ?? pairSyncRecoveryRequiresApproval');
});

function unsafeSession(close = vi.fn(async () => undefined)) {
  return {
    close,
    load: vi.fn(async () => ({})),
    sanitize: vi.fn(() => ({
      localAuthorizationFingerprint: null, pairedAuthorizationFingerprints: [],
      pendingAuthorizationFingerprints: []
    }))
  };
}

function authorizationSession({ includeTarget = true, includeRoute = true } = {}) {
  const desktopAuthorization = 'authorization-desktop';
  const targetAuthorization = 'authorization-a5';
  const overview = {
    paired_authorizations: includeRoute
      ? [{ authorization_id: targetAuthorization, host_name: 'A5' }] : [],
    pending_requests: [],
    sync_group: { local_host_name: 'Desktop', members: [
      { authorization_id: desktopAuthorization, host_name: 'Desktop', state: 'active' },
      ...(includeTarget
        ? [{ authorization_id: targetAuthorization, host_name: 'A5', state: 'active' }] : [])
    ] }
  };
  const session = {
    close: vi.fn(async () => undefined),
    load: vi.fn(async () => overview),
    sanitize: vi.fn((value) => ({
      localAuthorizationFingerprint: pairSyncAuthorizationFingerprint(desktopAuthorization),
      pairedAuthorizationFingerprints: value.paired_authorizations.map((authorization) =>
        pairSyncAuthorizationFingerprint(authorization.authorization_id)),
      pendingAuthorizationFingerprints: []
    }))
  };
  return { desktopAuthorization, session, targetAuthorization };
}

it('preserves pairing approval evidence when bounded session cleanup also fails', async () => {
  const session = unsafeSession(vi.fn(async () => { throw new Error('close failed'); }));
  await expect(inspectWindowsPairSyncRecoveryDesktop({
    desktopAuthorizationFingerprint: '0123456789abcdef', env: {}, execute, hostName: 'A5',
    openDesktopSession: vi.fn(async () => session), paths
  })).rejects.toMatchObject({ exitCode: 77, stage: 'desktop-pairing-readiness' });
});

it('classifies a standalone bounded session cleanup failure', async () => {
  const session = unsafeSession(vi.fn(async () => { throw new Error('close failed'); }));
  session.sanitize.mockReturnValue({
    localAuthorizationFingerprint: 'fedcba9876543210', pairedAuthorizationFingerprints: [],
    pendingAuthorizationFingerprints: []
  });
  session.load.mockResolvedValue({ paired_authorizations: [], pending_requests: [],
    sync_group: { local_host_name: 'Desktop', members: [{ authorization_id: 'desktop',
      host_name: 'Desktop', state: 'active' }] } });
  await expect(inspectWindowsPairSyncRecoveryDesktop({
    desktopAuthorizationFingerprint: 'fedcba9876543210', env: {}, execute, hostName: 'A5',
    openDesktopSession: vi.fn(async () => session), paths
  })).rejects.toMatchObject({ exitCode: 74, stage: 'desktop-session-close' });
});

it('classifies a product pairing overview read failure without exposing its payload', async () => {
  const session = unsafeSession();
  session.load.mockRejectedValue(new Error('bridge read failed'));
  await expect(inspectWindowsPairSyncRecoveryDesktop({
    desktopAuthorizationFingerprint: '0123456789abcdef', env: {}, execute, hostName: 'A5',
    openDesktopSession: vi.fn(async () => session), paths
  })).rejects.toMatchObject({ exitCode: 74, stage: 'desktop-pairing-load' });
});

it('accepts an existing A5 credential route bound to its active authorization', async () => {
  const fixture = authorizationSession();
  await expect(inspectWindowsPairSyncRecoveryDesktop({
    desktopAuthorizationFingerprint: pairSyncAuthorizationFingerprint(
      fixture.desktopAuthorization
    ), env: {}, execute, existingPairing: true, hostName: 'A5',
    openDesktopSession: vi.fn(async () => fixture.session), paths
  })).resolves.toMatchObject({
    overview: { pairedAuthorizationFingerprints: [
      pairSyncAuthorizationFingerprint(fixture.targetAuthorization)
    ] }
  });
});

it('accepts a fresh A5 Host only when membership and credential route are absent', async () => {
  const fixture = authorizationSession({ includeRoute: false, includeTarget: false });
  await expect(inspectWindowsPairSyncRecoveryDesktop({
    desktopAuthorizationFingerprint: pairSyncAuthorizationFingerprint(
      fixture.desktopAuthorization
    ), env: {}, execute, existingPairing: false, hostName: 'A5',
    openDesktopSession: vi.fn(async () => fixture.session), paths
  })).resolves.toMatchObject({ overview: { pairedAuthorizationFingerprints: [] } });
});

it('rejects an orphan A5 credential route without deleting or repairing it', async () => {
  const fixture = authorizationSession({ includeTarget: false });
  await expect(inspectWindowsPairSyncRecoveryDesktop({
    desktopAuthorizationFingerprint: pairSyncAuthorizationFingerprint(
      fixture.desktopAuthorization
    ), env: {}, execute, existingPairing: false, hostName: 'A5',
    openDesktopSession: vi.fn(async () => fixture.session), paths
  })).rejects.toMatchObject({ exitCode: 77, stage: 'desktop-pairing-readiness' });
});

it('preserves the product sync enable failure stage after APK preparation', async () => {
  const fsApi = {
    existsSync: vi.fn(() => true),
    readFileSync: vi.fn((_filePath, encoding) => encoding === 'utf8'
      ? JSON.stringify({ backupCreated: true, databasePreserved: true, schemaVersion: 1 })
      : Buffer.from('apk')),
    statSync: vi.fn(() => ({ size: 3 })), unlinkSync: vi.fn(), writeFileSync: vi.fn()
  };
  const executeAction = vi.fn(async () => ({
    code: 0, lines: [], output: '', stdout: 'Success\n'
  }));
  const session = {
    assertActive: vi.fn(),
    close: vi.fn(async () => undefined),
    enable: vi.fn(async () => { throw new Error('enable failed'); }),
    load: vi.fn(async () => ({ paired_authorizations: [], pending_requests: [] })),
    sanitize: vi.fn(() => ({
      localAuthorizationFingerprint: null, pairedAuthorizationFingerprints: [],
      pendingAuthorizationFingerprints: []
    }))
  };
  const failure = await runWindowsA5PairSyncRecovery({
    adbPort: '5037', buildIdentity: 'pair-1', hostName: 'A5',
    env: {}, evidenceRoot: 'C:\\evidence', execute: executeAction, fsApi,
    openDesktopSession: vi.fn(async () => session),
    paths: { adbPath: 'adb.exe', repoRoot: 'C:\\repo', systemNode: 'node.exe' },
    protectData: vi.fn(async () => ({ output: '' })), serial: '87a33a4b'
  }).catch((error) => error);
  expect(failure).toMatchObject({
    exitCode: 74,
    pairSyncFailureEvidence: {
      desktopOverview: 'pair-sync-recovery-failure-desktop-overview.json',
      screenshot: 'pair-sync-recovery-failure.png'
    },
    stage: 'desktop-sync-enable'
  });
  expect(session.close).toHaveBeenCalledOnce();
  expect(executeAction.mock.calls.some(([, args]) => args.includes('screencap'))).toBe(true);
  expect(executeAction.mock.calls.some(([, args]) => (
    args.includes('reverse') && args.includes('tcp:38641') && !args.includes('--remove')
  ))).toBe(false);
  expect(executeAction.mock.calls.some(([, args]) => (
    args.includes('reverse') && args.includes('--remove') && args.includes('tcp:38641')
  ))).toBe(false);
});

it('accepts only a live current session that owns the fixed running listener', () => {
  const session = { assertActive: vi.fn() };
  expect(() => assertPairSyncRuntimeOwnership({
    server_status: { port: 38641, state: 'running' }, sync_enabled: true
  }, session)).not.toThrow();
  expect(session.assertActive).toHaveBeenCalledOnce();
  for (const overview of [
    { server_status: { port: 38641, state: 'stopped' }, sync_enabled: true },
    { server_status: { port: 38642, state: 'running' }, sync_enabled: true },
    { server_status: { port: 38641, state: 'running' }, sync_enabled: false }
  ]) expect(() => assertPairSyncRuntimeOwnership(overview, session)).toThrow('fixed sync listener');
});

it('shares one bounded recovery window and cancels request observation at the first terminal', async () => {
  expect(PAIR_SYNC_RECOVERY_TIMEOUT_MS).toBe(11 * 60_000);
  const window = createPairSyncRecoveryWindow({ now: () => 20, timeoutMs: 180_000 });
  expect(window).toMatchObject({ deadline: 180_020, instrumentationTimeoutMs: 180_000 });
  const cancelPairRequest = vi.fn();
  const instrumentationError = Object.assign(new Error('instrumentation failed'), {
    stage: 'pair-sync-instrumentation'
  });
  await expect(waitForPairRequestWhileInstrumentationRuns(
    new Promise(() => undefined), Promise.reject(instrumentationError), cancelPairRequest
  )).rejects.toBe(instrumentationError);
  expect(cancelPairRequest).toHaveBeenCalledOnce();
});

it('preserves whichever concurrent failure becomes observable first', async () => {
  const instrumentationError = Object.assign(new Error('instrumentation failed'), {
    stage: 'pair-sync-instrumentation'
  });
  await expect(waitForPairRequestWhileInstrumentationRuns(
    new Promise(() => undefined), Promise.resolve({
      output: 'Timed out waiting for pairing or sync entry.'
    })
  )).rejects.toMatchObject({
    exitCode: 74, failureReason: 'pairing_entry_timeout', stage: 'pair-sync-instrumentation'
  });
  await expect(resolvePairSyncConcurrentFailure(
    Object.assign(new Error('request timeout'), { stage: 'desktop-pair-request' }),
    Promise.resolve({ output: 'Timed out waiting for pairing or sync entry.' })
  )).resolves.toMatchObject({
    message: 'request timeout', stage: 'desktop-pair-request'
  });
  await expect(resolvePairSyncConcurrentFailure(
    Object.assign(new Error('request conflict'), { stage: 'desktop-pair-request' }),
    Promise.reject(instrumentationError)
  )).resolves.toMatchObject({ message: 'request conflict', stage: 'desktop-pair-request' });
});
