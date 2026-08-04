// @vitest-environment node

import { createHash } from 'node:crypto';
import { expect, it, vi } from 'vitest';

import {
  inspectPairSyncRecoveryWorkspace, pairSyncRecoveryReadiness
} from './android-pair-sync-recovery-readiness.mjs';
import { inspectPairingPreferences } from './android-pair-sync-recovery-readiness-runner.mjs';

function snapshot({ dirty = 0, nodes = 0 } = {}) {
  const tables = new Set(['companion_meta', 'nodes', 'sync_object_state']);
  const database = { prepare: (sql) => ({ get: (value) => {
    if (sql.includes('sqlite_master')) return tables.has(value) ? { present: 1 } : undefined;
    if (sql.includes('companion_meta')) return value === 'device_id' ? { value: 'android-device-1' } : undefined;
    if (sql.includes('sync_object_state')) return { count: dirty };
    if (sql.includes('nodes')) return { count: nodes };
    return undefined;
  } }) };
  const inspection = inspectPairSyncRecoveryWorkspace(database);
  return { database: { exists: true, inspection }, packageInfo: { installed: true } };
}

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

it('hashes the existing remote peer on-device without returning its value', async () => {
  const peer = 'desktop-device-1';
  const run = vi.fn()
    .mockResolvedValueOnce({ stdout: '' })
    .mockResolvedValueOnce({ stdout: `${createHash('sha256').update('').digest('hex')}  -\n` })
    .mockResolvedValueOnce({ stdout: `${createHash('sha256').update(peer).digest('hex')}  -\n` });
  const result = await inspectPairingPreferences({ adb: 'adb', appId: 'app', serial: 'a5' }, run);
  expect(result).toMatchObject({ pairingCredentialsPresent: true, remotePeerFingerprint: expect.any(String) });
  expect(run.mock.calls.slice(1).every(([, args]) => args.at(-1).includes('sha256sum'))).toBe(true);
  expect(JSON.stringify(result)).not.toContain(peer);
});

it('rejects conflicting old and current peer metadata', () => {
  expect(pairSyncRecoveryReadiness(snapshot(), true, null, true)).toMatchObject({
    missingPrerequisites: ['existing_pairing_peer_conflict'], resultStatus: 'approval_required'
  });
});
