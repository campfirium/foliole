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
          endpoint_url: 'http://desktop:38641', kind: 'run_finished',
          message: syncFailureMessage ?? 'Desktop returned 401.', status: 'failed'
        }])
      };
      if (value === 'workspace_sync_endpoint_url') return { value: 'http://desktop:38641' };
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

it('reports only bounded dirty object type counts', () => {
  const database = { prepare: (sql) => ({
    all: () => sql.includes('GROUP BY object_type')
      ? [{ count: 1, object_type: 'node' }] : [],
    get: (value) => {
      if (sql.includes('sqlite_master')) return { present: 1 };
      if (sql.includes('companion_meta')) return value === 'device_id'
        ? { value: 'android-1' } : undefined;
      return { count: 1 };
    }
  }) };
  expect(inspectPairSyncRecoveryWorkspace(database).dirtyObjectCounts).toEqual({ node: 1 });
});

it('reports pending delivery counts only by hashed group member identity', () => {
  const peerId = 'desktop-device-1';
  const database = { prepare: (sql) => ({
    all: () => sql.includes('GROUP BY member.authorization_id')
      ? [{ count: 2, peer_id: peerId }] : [],
    get: (value) => {
      if (sql.includes('sqlite_master')) return { present: 1 };
      if (sql.includes('companion_meta')) return value === 'device_id'
        ? { value: 'android-1' } : undefined;
      return { count: 0 };
    }
  }) };
  const inspection = inspectPairSyncRecoveryWorkspace(database);
  const fingerprint = createHash('sha256').update(peerId).digest('hex').slice(0, 16);
  expect(inspection.pendingDeliveryCountsByPeerFingerprint).toEqual({ [fingerprint]: 2 });
  expect(JSON.stringify(inspection)).not.toContain(peerId);
});

it('recognizes generic multi-device acceptance facts without a track-specific prefix', () => {
  const tables = new Set(['companion_meta', 'nodes', 'sync_object_state']);
  const database = { prepare: (sql) => ({
    all: () => sql.includes("title GLOB 'T121 B fact *'")
      ? [{ id: 'node-random', origin: 'B' }] : [],
    get: (value) => {
      if (sql.includes('sqlite_master')) return tables.has(value) ? { present: 1 } : undefined;
      if (sql.includes('companion_meta')) {
        return value === 'device_id' ? { value: 'android-1' } : undefined;
      }
      return { count: 0 };
    }
  }) };
  expect(inspectPairSyncRecoveryWorkspace(database).journeyFacts)
    .toEqual({ 'node-random': 'B' });
});

it('reads missing resource counts through the Node SQLite row shape', () => {
  const tables = new Set(['attachment_blobs', 'companion_meta', 'content_blob_data',
    'content_blobs', 'nodes', 'sync_object_state']);
  const queries = [];
  const database = { prepare: (sql) => {
    queries.push(sql);
    return {
      all: () => [],
      get: (value) => {
        if (sql.includes('sqlite_master')) return tables.has(value) ? { present: 1 } : undefined;
        if (sql.includes('companion_meta')) return value === 'device_id' ? { value: 'android-1' } : undefined;
        if (sql.includes('attachment_blobs')) return { count: 2 };
        if (sql.includes('LEFT JOIN content_blob_data')) return { count: 1 };
        return { count: 0 };
      }
    };
  } };
  expect(inspectPairSyncRecoveryWorkspace(database)).toMatchObject({
    missingAttachmentCount: 2, missingContentBlobCount: 1
  });
  expect(queries).toContainEqual(expect.stringContaining(
    "availability NOT IN ('cached', 'local')"
  ));
});

it('allows an empty unpaired workspace without inventing a credential identity', () => {
  expect(pairSyncRecoveryReadiness(snapshot(), false)).toMatchObject({
    missingPrerequisites: [], pairingPeerAuthorizationFingerprint: null,
    resultStatus: 'ready', storedAuthorizationFingerprint: null
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

it('allows existing credentials only with a non-sensitive authorization peer fingerprint', () => {
  expect(pairSyncRecoveryReadiness(snapshot(), true, '0123456789abcdef')).toMatchObject({
    missingPrerequisites: [], pairingPeerAuthorizationFingerprint: '0123456789abcdef',
    resultStatus: 'ready'
  });
});

it('reports only the fixed credential-rejection signal from sync history', () => {
  expect(pairSyncRecoveryReadiness(
    snapshot({ credentialsRejected: true, dirty: 1 }), true, '0123456789abcdef'
  )).toMatchObject({
    pairingCredentialRejectionReason: null, pairingCredentialsRejected: true
  });
  expect(pairSyncRecoveryReadiness(snapshot(), true, '0123456789abcdef'))
    .toMatchObject({ pairingCredentialsRejected: false });
});

it('reports an allowlisted desktop credential-rejection reason without response details', () => {
  const input = snapshot({ credentialsRejected: true, dirty: 1 });
  input.database.inspection.pairingCredentialRejectionReason = 'unknown_authorization';
  expect(pairSyncRecoveryReadiness(input, true, '0123456789abcdef')).toMatchObject({
    pairingCredentialRejectionReason: 'unknown_authorization', pairingCredentialsRejected: true
  });
});

it('classifies a local Sync Group signing failure as an exact credential repair signal', () => {
  const input = snapshot({
    syncFailureMessage: 'Failed to sign companion sync request. http://192.168.0.8:38641', nodes: 1293
  });
  expect(pairSyncRecoveryReadiness(input, true, '0123456789abcdef')).toMatchObject({
    latestSyncFailureDetail: 'Failed to sign companion sync request. <endpoint>',
    latestSyncFailureOnStoredEndpoint: true,
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

it('hashes the local and peer authorizations on-device without returning their values', async () => {
  const authorization = 'authorization-a5';
  const peer = 'desktop-device-1';
  const run = vi.fn(async (_command, args) => {
    const script = args.at(-1);
    if (String(script).includes('name=\\"authorization_id\\"')) {
      return { stdout: `${createHash('sha256').update(authorization).digest('hex')}  -\n` };
    }
    if (String(script).includes('remote_peer_id')) {
      return { stdout: `${createHash('sha256').update(peer).digest('hex')}  -\n` };
    }
    return { stdout: '' };
  });
  const result = await inspectPairingPreferences({ adb: 'adb', appId: 'app', serial: 'a5' }, run);
  expect(result).toMatchObject({
    pairingCredentialsPresent: true,
    pairingPeerAuthorizationFingerprint:
      createHash('sha256').update(peer).digest('hex').slice(0, 16),
    storedAuthorizationFingerprint:
      createHash('sha256').update(authorization).digest('hex').slice(0, 16)
  });
  expect(run.mock.calls.some(([, args]) => args.at(-2) === '-c'
    && args.at(-1) === `"grep -q 'name=\\"authorization_id\\"' shared_prefs/foliole_companion_pairing.xml"`)).toBe(true);
  expect(run.mock.calls.filter(([, args]) => String(args.at(-1)).includes('sha256sum'))).toHaveLength(2);
  expect(run.mock.calls.filter(([, args]) => String(args.at(-1)).includes("tr -d '\\\\n'"))).toHaveLength(2);
  expect(JSON.stringify(result)).not.toContain(authorization);
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
      pairingCredentialsPresent: false, pairingPeerAuthorizationFingerprint: null,
      storedAuthorizationFingerprint: null
    });
});

it('rejects conflicting old and current peer metadata', () => {
  expect(pairSyncRecoveryReadiness(snapshot(), true, null, true)).toMatchObject({
    missingPrerequisites: ['existing_pairing_peer_conflict'], resultStatus: 'approval_required'
  });
});
