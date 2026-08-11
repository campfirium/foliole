// @vitest-environment node

import { createHash } from 'node:crypto';
import { expect, it, vi } from 'vitest';

import {
  inspectPairSyncRecoveryWorkspace, pairSyncRecoveryReadiness
} from './android-pair-sync-recovery-readiness.mjs';
import { inspectPairingPreferences } from './android-pair-sync-recovery-readiness-runner.mjs';

function snapshot({ credentialsRejected = false, dirty = 0, nodes = 0, syncFailureMessage } = {}) {
  const tables = new Set(['companion_meta', 'nodes', 'sync_object_state']);
  const database = { prepare: (sql) => ({ get: (value) => {
    if (sql.includes('sqlite_master')) return tables.has(value) ? { present: 1 } : undefined;
    if (sql.includes('companion_meta')) {
      if (value === 'device_id') return { value: 'android-device-1' };
      if (value === 'workspace_sync_events' && (credentialsRejected || syncFailureMessage)) return {
        value: JSON.stringify([{
          kind: 'run_finished', message: syncFailureMessage ?? 'Desktop returned 401.', status: 'failed'
        }])
      };
      return undefined;
    }
    if (sql.includes('sync_object_state')) return { count: dirty };
    if (sql.includes('nodes')) return { count: nodes };
    return undefined;
  } }) };
  const inspection = inspectPairSyncRecoveryWorkspace(database);
  return { database: { exists: true, inspection }, packageInfo: { installed: true } };
}

it('excludes device-private view state from the unsynced push gate', () => {
  const queries = [];
  const database = { prepare: (sql) => {
    queries.push(sql);
    return { get: (value) => {
      if (sql.includes('sqlite_master')) return { present: 1 };
      if (sql.includes('companion_meta')) return value === 'device_id' ? { value: 'android-device-1' } : undefined;
      return { count: 0 };
    } };
  } };

  expect(inspectPairSyncRecoveryWorkspace(database).dirtyRecordCount).toBe(0);
  expect(queries).toContainEqual(expect.stringContaining("object_type <> 'view_state'"));
});

it('reports the persisted Sync Group identity without deriving it from pairing metadata', () => {
  const tables = new Set([
    'companion_meta', 'nodes', 'sync_group_local_state', 'sync_group_members',
    'sync_groups', 'sync_object_state'
  ]);
  const database = { prepare: (sql) => ({ get: (value) => {
    if (sql.includes('sqlite_master')) return tables.has(value) ? { present: 1 } : undefined;
    if (sql.includes('JOIN sync_groups')) {
      return { group_id: 'group-1', timeline_id: 'timeline-1' };
    }
    if (sql.includes('companion_meta')) return value === 'device_id' ? { value: 'android-1' } : undefined;
    if (sql.includes('sync_group_members')) return { count: 3 };
    return { count: 0 };
  } }) };

  expect(inspectPairSyncRecoveryWorkspace(database)).toMatchObject({
    activeSyncGroupMemberCount: 3,
    syncGroupId: 'group-1',
    syncGroupTimelineId: 'timeline-1'
  });
});

it('recognizes generic multi-device acceptance facts without a track-specific prefix', () => {
  const tables = new Set(['companion_meta', 'nodes', 'sync_object_state']);
  const database = { prepare: (sql) => ({
    all: () => [{ id: 'multi-device-sync-a-1', origin: 'A' }],
    get: (value) => {
      if (sql.includes('sqlite_master')) return tables.has(value) ? { present: 1 } : undefined;
      if (sql.includes('companion_meta')) {
        return value === 'device_id' ? { value: 'android-1' } : undefined;
      }
      return { count: 0 };
    }
  }) };
  expect(inspectPairSyncRecoveryWorkspace(database).journeyFacts)
    .toEqual({ 'multi-device-sync-a-1': 'A' });
});

it('allows only an empty unpaired workspace with a stable device identity', () => {
  expect(pairSyncRecoveryReadiness(snapshot(), false)).toMatchObject({
    deviceIdentityFingerprint: expect.stringMatching(/^[0-9a-f]{16}$/u),
    missingPrerequisites: [], resultStatus: 'ready'
  });
});

it.each([
  [snapshot({ nodes: 2 }), false, 'nonempty_workspace_requires_review'],
  [snapshot({ dirty: 1 }), false, 'unsynced_device_data_requires_review'],
  [snapshot(), true, 'existing_pairing_peer_unproven']
])('fails closed before mutation for risky device state', (input, paired, reason) => {
  expect(pairSyncRecoveryReadiness(input, paired)).toMatchObject({
    missingPrerequisites: expect.arrayContaining([reason]), resultStatus: 'approval_required'
  });
});

it('allows existing credentials only with a non-sensitive remote peer fingerprint', () => {
  expect(pairSyncRecoveryReadiness(snapshot(), true, '0123456789abcdef')).toMatchObject({
    missingPrerequisites: [], remotePeerFingerprint: '0123456789abcdef', resultStatus: 'ready'
  });
});

it('reports only the fixed credential-rejection signal from sync history', () => {
  expect(pairSyncRecoveryReadiness(
    snapshot({ credentialsRejected: true, dirty: 1 }), true, '0123456789abcdef'
  )).toMatchObject({
    latestSyncRunStatus: 'failed',
    latestSyncWaitingConfirmationCount: 0,
    latestSyncWaitingSendCount: 0,
    pairingCredentialRejectionReason: null, pairingCredentialsRejected: true
  });
  expect(pairSyncRecoveryReadiness(snapshot(), true, '0123456789abcdef'))
    .toMatchObject({ pairingCredentialsRejected: false });
});

it('reports an allowlisted desktop credential-rejection reason without response details', () => {
  const input = snapshot({ credentialsRejected: true, dirty: 1 });
  input.database.inspection.pairingCredentialRejectionReason = 'unknown_device';
  expect(pairSyncRecoveryReadiness(input, true, '0123456789abcdef')).toMatchObject({
    pairingCredentialRejectionReason: 'unknown_device', pairingCredentialsRejected: true
  });
});

it('classifies a local Sync Group signing failure as an exact credential repair signal', () => {
  const input = snapshot({
    syncFailureMessage: 'Failed to sign companion sync request.', nodes: 1293
  });
  expect(pairSyncRecoveryReadiness(input, true, '0123456789abcdef')).toMatchObject({
    pairingCredentialRejectionReason: 'local_signing_unavailable',
    pairingCredentialsRejected: true
  });
});

it('accepts a readable synced workspace after persisted pairing', () => {
  const input = snapshot({ nodes: 1077 });
  input.packageInfo.installed = false;
  expect(pairSyncRecoveryReadiness(input, true, '0123456789abcdef')).toMatchObject({
    missingPrerequisites: [], nodeCount: 1077, resultStatus: 'ready'
  });
});

it('hashes the existing remote peer on-device without returning its value', async () => {
  const device = 'android-device-1';
  const peer = 'desktop-device-1';
  const run = vi.fn(async (_command, args) => {
    const script = args.at(-1);
    if (String(script).includes('name=\\"device_id\\"')) {
      return { stdout: `${createHash('sha256').update(device).digest('hex')}  -\n` };
    }
    if (String(script).includes('remote_peer_id')) {
      return { stdout: `${createHash('sha256').update('').digest('hex')}  -\n` };
    }
    if (String(script).includes('primary_device_id')) {
      return { stdout: `${createHash('sha256').update(peer).digest('hex')}  -\n` };
    }
    return { stdout: '' };
  });
  const result = await inspectPairingPreferences({ adb: 'adb', appId: 'app', serial: 'a5' }, run);
  expect(result).toMatchObject({
    pairingCredentialsPresent: true,
    remotePeerFingerprint: createHash('sha256').update(peer).digest('hex').slice(0, 16),
    storedDeviceFingerprint: createHash('sha256').update(device).digest('hex').slice(0, 16)
  });
  expect(run.mock.calls.some(([, args]) => args.at(-2) === '-c'
    && args.at(-1) === `"grep -q 'name=\\"device_id\\"' shared_prefs/foliole_companion_pairing.xml"`)).toBe(true);
  expect(run.mock.calls.filter(([, args]) => String(args.at(-1)).includes('sha256sum'))).toHaveLength(3);
  expect(run.mock.calls.filter(([, args]) => String(args.at(-1)).includes("tr -d '\\\\n'"))).toHaveLength(3);
  expect(JSON.stringify(result)).not.toContain(device);
  expect(JSON.stringify(result)).not.toContain(peer);
});

it('treats an empty retained preferences file as unpaired', async () => {
  const missing = Object.assign(new Error('missing'), { code: 1 });
  const run = vi.fn(async (_command, args) => {
    if (String(args.at(-1)).startsWith('"grep -q')) throw missing;
    return { stdout: '' };
  });
  await expect(inspectPairingPreferences({ adb: 'adb', appId: 'app', serial: 'a5' }, run))
    .resolves.toEqual({
      pairingCredentialsPresent: false, remotePeerFingerprint: null, storedDeviceFingerprint: null
    });
});

it('rejects conflicting old and current peer metadata', () => {
  expect(pairSyncRecoveryReadiness(snapshot(), true, null, true)).toMatchObject({
    missingPrerequisites: ['existing_pairing_peer_conflict'], resultStatus: 'approval_required'
  });
});
