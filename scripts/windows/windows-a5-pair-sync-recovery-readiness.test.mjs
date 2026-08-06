import { expect, it, vi } from 'vitest';

import { postPairSyncRecoveryReadiness } from './windows-a5-pair-sync-recovery-readiness.mjs';

function result(prefix, value, code = 0) {
  return { code, output: `${prefix}${JSON.stringify(value)}\n`, stdout: `${prefix}${JSON.stringify(value)}\n` };
}

const workspace = {
  canonicalInbox: { active: true, kind: 'folder' },
  counts: { content_blobs: 2039, node_order: 969, nodes: 1299 },
  missingPrerequisites: [],
  pairingWorkspace: { localDeviceIdentityPresent: true, syncEndpointPresent: true },
  resultStatus: 'ready',
  schemaVersion: 1
};
const pairing = {
  deviceIdentityFingerprint: 'c6b193a8d1f83849',
  dirtyRecordCount: 0,
  missingPrerequisites: [],
  nodeCount: 1299,
  pairingCredentialsPresent: true,
  pairingPeerConflict: false,
  remotePeerFingerprint: '82cc2dc5c98135c8',
  resultStatus: 'ready',
  schemaVersion: 1
};

it('requires the fixed identity, preserved pairing, and zero dirty records after sync', async () => {
  const run = vi.fn()
    .mockResolvedValueOnce(result('[android-data] capture-annotation-readiness=', workspace))
    .mockResolvedValueOnce(result('[android-data] pair-sync-recovery-readiness=', pairing));

  await expect(postPairSyncRecoveryReadiness({
    deviceFingerprint: pairing.deviceIdentityFingerprint,
    env: {},
    paths: { adbPath: '/adb', repoRoot: '/repo', systemNode: '/node' },
    run,
    serial: 'fixed-a5'
  })).resolves.toMatchObject({ readiness: { dirtyRecordCount: 0, pairingCredentialsPresent: true } });
});

it('rejects a UI-complete run whose dirty records did not receive acknowledgements', async () => {
  const run = vi.fn()
    .mockResolvedValueOnce(result('[android-data] capture-annotation-readiness=', workspace))
    .mockResolvedValueOnce(result('[android-data] pair-sync-recovery-readiness=', {
      ...pairing, dirtyRecordCount: 6, resultStatus: 'approval_required',
      missingPrerequisites: ['unsynced_device_data_requires_review']
    }, 77));

  await expect(postPairSyncRecoveryReadiness({
    deviceFingerprint: pairing.deviceIdentityFingerprint,
    env: {},
    paths: { adbPath: '/adb', repoRoot: '/repo', systemNode: '/node' },
    run,
    serial: 'fixed-a5'
  })).rejects.toMatchObject({ stage: 'post-sync-convergence' });
});
