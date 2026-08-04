// @vitest-environment node

import { expect, it } from 'vitest';

import {
  inspectPairSyncRecoveryWorkspace, pairSyncRecoveryReadiness
} from './android-pair-sync-recovery-readiness.mjs';

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
  [snapshot(), true, 'existing_pairing_requires_review']
])('fails closed before mutation for risky device state', (input, paired, reason) => {
  expect(pairSyncRecoveryReadiness(input, paired)).toMatchObject({
    missingPrerequisites: expect.arrayContaining([reason]), resultStatus: 'approval_required'
  });
});
