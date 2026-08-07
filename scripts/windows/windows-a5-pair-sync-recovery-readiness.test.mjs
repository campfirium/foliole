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
  pairingCredentialsRejected: false,
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
    maxAttempts: 1,
    paths: { adbPath: '/adb', repoRoot: '/repo', systemNode: '/node' },
    run,
    serial: 'fixed-a5'
  })).rejects.toMatchObject({ stage: 'post-sync-convergence' });
});

it('waits for restart-created dirty state to receive its foreground sync acknowledgement', async () => {
  const dirty = result('[android-data] pair-sync-recovery-readiness=', {
    ...pairing, dirtyRecordCount: 1, resultStatus: 'approval_required',
    missingPrerequisites: ['unsynced_device_data_requires_review']
  }, 77);
  const run = vi.fn()
    .mockResolvedValueOnce(result('[android-data] capture-annotation-readiness=', workspace))
    .mockRejectedValueOnce(Object.assign(new Error('exit 77'), { result: dirty }))
    .mockResolvedValueOnce(result('[android-data] pair-sync-recovery-readiness=', pairing));
  const wait = vi.fn();

  await expect(postPairSyncRecoveryReadiness({
    deviceFingerprint: pairing.deviceIdentityFingerprint,
    env: {}, maxAttempts: 2,
    paths: { adbPath: '/adb', repoRoot: '/repo', systemNode: '/node' },
    run, serial: 'fixed-a5', wait
  })).resolves.toMatchObject({ readiness: { dirtyRecordCount: 0 } });
  expect(wait).toHaveBeenCalledWith(1_000);
});

it('waits for the preserved database to reopen after Android process restart', async () => {
  const starting = result('[android-data] pair-sync-recovery-readiness=', {
    ...pairing,
    deviceIdentityFingerprint: null, dirtyRecordCount: null,
    missingPrerequisites: ['database_unavailable'], nodeCount: null,
    resultStatus: 'approval_required'
  }, 77);
  const run = vi.fn()
    .mockResolvedValueOnce(result('[android-data] capture-annotation-readiness=', workspace))
    .mockRejectedValueOnce(Object.assign(new Error('exit 77'), { result: starting }))
    .mockResolvedValueOnce(result('[android-data] pair-sync-recovery-readiness=', pairing));

  await expect(postPairSyncRecoveryReadiness({
    deviceFingerprint: pairing.deviceIdentityFingerprint,
    env: {}, maxAttempts: 2,
    paths: { adbPath: '/adb', repoRoot: '/repo', systemNode: '/node' },
    run, serial: 'fixed-a5', wait: vi.fn()
  })).resolves.toMatchObject({ readiness: { dirtyRecordCount: 0 } });
});
