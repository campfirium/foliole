// @vitest-environment node

import path from 'node:path';

import { expect, it, vi } from 'vitest';

import {
  departedCredentialFixture, joinedEmptyCredentialFixture
} from './android-departed-credential-fixture.mjs';
import {
  authorizationFingerprint
} from './android-sync-group-authorization-inspection.mjs';
import {
  assertFreshCredentialReceipt,
  credentialEvidenceExecute,
  macosA5CredentialsOnlyModeArgs,
  runMacosA5PairCredentialsEntry
} from './macos-a5-pair-credentials-action.mjs';
import {
  assertFreshCredentialRejoinBaseline, assertJoinedEmptyCredentialReauthorization,
  collectCredentialProtectedReadiness, leaveJoinedEmptyCredentialSession
} from './macos-a5-pair-credentials-rejoin.mjs';

it('stops fresh A5 pairing after native credentials can sign the first request', async () => {
  const runPairSync = vi.fn().mockResolvedValue({
    output: '', pairSyncRecovery: { manifestPath: '/tmp/credentials.json' }
  });
  const args = {
    assertFixed: vi.fn(), build: vi.fn(), buildIdentity: () => 'build-1', checked: vi.fn(),
    env: {}, execute: vi.fn(), paths: {
      artifactsRoot: '/evidence', desktopDevLibrary: '/library',
      sourceRepoRoot: '/repo/foliole'
    }, serial: '87a33a4b'
  };
  await runMacosA5PairCredentialsEntry(args, {
    buildDesktop: vi.fn(),
    resolveReadiness: () => ({
      credentialRepairRequired: false, existingPairing: false, hostName: 'A5',
      pairTargetAuthorizationFingerprint: 'peer-1'
    }),
    runPairSync
  });

  expect(runPairSync).toHaveBeenCalledWith(expect.objectContaining({
    evidenceRoot: path.join('/evidence', 'a5-pair-credentials/build-1'),
    instrumentationModeArgs: macosA5CredentialsOnlyModeArgs,
    desktopAuthorizationFingerprint: 'peer-1', recoveryEvidenceGoal: 'credentials-signable'
  }));
  expect(macosA5CredentialsOnlyModeArgs()).toEqual([
    '-e', 'foliolePairSyncEvidenceGoal', 'credentials-signable',
    '-e', 'foliolePairSyncTimeoutMs', '120000'
  ]);
  expect(runPairSync.mock.calls[0][0].execute).not.toBe(args.execute);
});

it('bounds only the credential instrumentation wait instead of inheriting full sync timeout', async () => {
  const execute = vi.fn().mockResolvedValue({ code: 0 });
  const bounded = credentialEvidenceExecute(execute, 12_345);
  await bounded('adb', ['shell'], {
    timeoutCode: 'pair_sync_instrumentation_timeout', timeoutMs: 660_000
  });
  await bounded('adb', ['install'], { timeoutCode: 'pair_sync_install_timeout', timeoutMs: 300_000 });

  expect(execute.mock.calls[0][2]).toMatchObject({ timeoutMs: 12_345 });
  expect(execute.mock.calls[1][2]).toMatchObject({ timeoutMs: 300_000 });
});

const digest = 'a'.repeat(64);
const joinedEmpty = joinedEmptyCredentialFixture;
const departed = departedCredentialFixture;

function withoutProtectedSnapshot(readiness) {
  const preflight = { ...readiness };
  delete preflight.dirtyObjectCounts;
  delete preflight.protectedContentDigest;
  return preflight;
}

it('routes exact joined-empty credentials through product Leave and a fresh bounded join', async () => {
  const runPairSync = vi.fn().mockResolvedValue({
    output: '', pairSyncRecovery: { manifestPath: '/tmp/credentials.json' }
  });
  const leaveJoinedEmpty = vi.fn().mockResolvedValue({ manifestPath: '/tmp/leave.json' });
  const resolveReadiness = vi.fn()
    .mockReturnValueOnce(withoutProtectedSnapshot(joinedEmpty))
    .mockReturnValueOnce(withoutProtectedSnapshot(departed));
  const collectProtectedReadiness = vi.fn(async (readiness) => ({
    ...readiness, dirtyObjectCounts: {}, protectedContentDigest: digest
  }));
  const args = {
    assertFixed: vi.fn(), build: vi.fn(), buildIdentity: () => 'build-2', checked: vi.fn(),
    env: {}, execute: vi.fn(), paths: {
      artifactsRoot: '/evidence', desktopDevLibrary: '/library',
      sourceRepoRoot: '/repo/foliole'
    }, serial: '87a33a4b'
  };
  await runMacosA5PairCredentialsEntry(args, {
    buildDesktop: vi.fn(), collectProtectedReadiness,
    inspectDesktopDeparture: () => ({ groupId: 'group-1',
      remotePeerAuthorizationFingerprint: joinedEmpty.syncGroupRemotePeerFingerprint,
      timelineId: 'timeline-1' }),
    leaveJoinedEmpty, readReceipt: () => ({
      credentials: 'saved_signable', initialSync: 'not_started', pairingPath: 'new'
    }), produceHandoff: vi.fn(), resolveReadiness, runPairSync
  });

  expect(leaveJoinedEmpty).toHaveBeenCalledWith(expect.objectContaining({
    baseline: expect.objectContaining({ groupId: 'group-1', protectedContentDigest: digest }),
    evidenceRoot: path.join('/evidence', 'a5-pair-credentials/build-2/leave')
  }));
  expect(runPairSync).toHaveBeenCalledWith(expect.objectContaining({
    credentialRepairRequired: false, existingPairing: false, hostName: 'A5',
    pairedAuthorizationFingerprint: null, pairRequestIdentity: 'A5',
    protectedSyncGroup: { groupId: 'group-1', timelineId: 'timeline-1' },
    desktopAuthorizationFingerprint: joinedEmpty.syncGroupRemotePeerFingerprint,
    recoveryEvidenceGoal: 'credentials-signable'
  }));
  expect(collectProtectedReadiness).toHaveBeenCalledTimes(2);
});

it('merges the same read-only database snapshot fields before and after Leave', async () => {
  const events = [];
  const execute = vi.fn(async () => { events.push('stop'); return { code: 0 }; });
  const collectSnapshot = vi.fn().mockResolvedValue({ database: { integrity: 'ok', inspection: {
    activeSyncGroupMemberCount: 3,
    dirtyObjectCounts: {}, dirtyRecordCount: 0, nodeCount: 0,
    localMemberAuthorizationFingerprint: authorizationFingerprint('authorization-a5'),
    protectedContentDigest: digest, storedLocalDepartureAuthorizationFingerprint: null,
    storedLocalDepartureMatchCount: 0, storedLocalMemberAuthorizationFingerprint: null,
    storedSyncGroupCount: 1, storedSyncGroupDepartureCount: 0,
    storedSyncGroupId: 'group-1', storedSyncGroupMemberCount: 3,
    storedSyncGroupTimelineId: 'timeline-1', syncGroupId: 'group-1',
    syncGroupTimelineId: 'timeline-1', workgroupKeyPresent: true,
    workspaceSyncEndpointPresent: true
  } } });
  const readiness = withoutProtectedSnapshot(joinedEmpty);
  await expect(collectCredentialProtectedReadiness(
    readiness, { env: {}, execute, paths: { adb: '/adb' }, serial: '87a33a4b' }, {
      collectSnapshot: async (options) => { events.push('snapshot'); return collectSnapshot(options); }
    }
  )).resolves.toMatchObject({ dirtyObjectCounts: {}, protectedContentDigest: digest });
  expect(events).toEqual(['stop', 'snapshot']);
  expect(execute).toHaveBeenCalledWith('/adb', [
    '-s', '87a33a4b', 'shell', 'am', 'force-stop', 'com.foliole.android'
  ], expect.objectContaining({ timeoutCode: 'credential_snapshot_stop_timeout' }));
  expect(collectSnapshot).toHaveBeenCalledWith(expect.objectContaining({
    adb: '/adb', appId: 'com.foliole.android', includeAttachments: false,
    includeEvents: false, serial: '87a33a4b', tables: ['nodes']
  }));
  expect(collectSnapshot.mock.calls[0][0].databaseInspector).toBeTypeOf('function');
  collectSnapshot.mockResolvedValueOnce({ database: { integrity: 'ok', inspection: {
    activeSyncGroupMemberCount: 3,
    dirtyObjectCounts: {}, dirtyRecordCount: 0, nodeCount: 0,
    protectedContentDigest: digest, syncGroupId: 'group-1',
    syncGroupTimelineId: 'timeline-1', workgroupKeyPresent: true
  } } });
  await expect(collectCredentialProtectedReadiness(
    readiness, { env: {}, execute, paths: { adb: '/adb' }, serial: '87a33a4b' }, {
      collectSnapshot
    }
  )).rejects.toThrow('changed before');
});

it('fails before snapshot when the fixed A5 writer cannot be stopped', async () => {
  const collectSnapshot = vi.fn();
  await expect(collectCredentialProtectedReadiness(
    withoutProtectedSnapshot(joinedEmpty), {
      env: {}, execute: vi.fn().mockResolvedValue({ code: 1, stderr: 'stop failed' }),
      paths: { adb: '/adb' }, serial: '87a33a4b'
    }, { collectSnapshot }
  )).rejects.toThrow('Failed to stop A5');
  expect(collectSnapshot).not.toHaveBeenCalled();
});

it('rejects any Leave drift or credential receipt that advances initial sync', () => {
  const baseline = assertJoinedEmptyCredentialReauthorization(joinedEmpty);
  expect(assertFreshCredentialRejoinBaseline(departed, baseline)).toBe(departed);
  expect(() => assertFreshCredentialRejoinBaseline({ ...departed, protectedContentDigest: 'b'.repeat(64) }, baseline))
    .toThrow('did not preserve');
  expect(() => assertFreshCredentialReceipt({
    credentials: 'saved_signable', initialSync: 'started', pairingPath: 'new'
  })).toThrow('before initial sync');
});

it('proves the desktop roster and group identity around formal product Leave', async () => {
  const a5Authorization = 'authorization-a5';
  const desktopAuthorization = 'authorization-desktop';
  const offlineAuthorization = 'authorization-offline';
  const baseline = assertJoinedEmptyCredentialReauthorization(joinedEmpty);
  const overview = (members) => ({ paired_authorizations: [], pending_requests: [], sync_enabled: true,
    server_status: { port: 38641, state: 'running' }, sync_group: {
      group_id: 'group-1', local_host_name: 'host-authorization-desktop',
      timeline_id: 'timeline-1', members: members.map((authorization_id) => ({
        authorization_id, host_name: `host-${authorization_id}`, state: 'active'
      }))
    } });
  const session = {
    assertActive: vi.fn(), close: vi.fn().mockResolvedValue(),
    enable: vi.fn().mockResolvedValue(overview([
      a5Authorization, desktopAuthorization, offlineAuthorization
    ])),
    load: vi.fn().mockResolvedValue(overview([desktopAuthorization, offlineAuthorization])),
    sanitize: vi.fn(() => ({
      localAuthorizationFingerprint: authorizationFingerprint(desktopAuthorization),
      pendingAuthorizationFingerprints: []
    }))
  };
  const maintenance = vi.fn().mockResolvedValue({ manifestPath: '/tmp/leave.json' });
  const writeBoundaryEvidence = vi.fn();
  await leaveJoinedEmptyCredentialSession({ baseline, buildIdentity: 'build-3', env: {},
    evidenceRoot: '/tmp/evidence', execute: vi.fn(), paths: {
      buildRoot: '/repo', desktopDevLibrary: '/library'
    },
    serial: '87a33a4b' }, {
    maintenance, openSession: async () => session, wait: vi.fn(), writeBoundaryEvidence
  });

  expect(maintenance).toHaveBeenCalledWith(expect.objectContaining({
    action: 'leave-sync-group', installMain: false
  }));
  expect(session.assertActive).toHaveBeenCalledTimes(2);
  expect(session.close).toHaveBeenCalledOnce();
  expect(writeBoundaryEvidence).toHaveBeenCalledWith('/tmp/evidence', expect.objectContaining({
    actual: expect.objectContaining({
      localAuthorizationFingerprint: authorizationFingerprint(desktopAuthorization),
      localMemberAuthorizationFingerprint: baseline.remotePeerAuthorizationFingerprint
    })
  }));

  const hostOnlyOverview = overview([
    a5Authorization, desktopAuthorization, offlineAuthorization
  ]);
  delete hostOnlyOverview.sync_group.members[0].authorization_id;
  session.enable.mockResolvedValueOnce(hostOnlyOverview);
  await expect(leaveJoinedEmptyCredentialSession({ baseline, buildIdentity: 'build-3', env: {},
    evidenceRoot: '/tmp/evidence', execute: vi.fn(), paths: {
      buildRoot: '/repo', desktopDevLibrary: '/library'
    },
    serial: '87a33a4b' }, {
    maintenance, openSession: async () => session, wait: vi.fn(), writeBoundaryEvidence
  }))
    .rejects.toThrow('active member authorization is missing');
  expect(maintenance).toHaveBeenCalledTimes(1);
});
