import { expect, it, vi } from 'vitest';

import { postPairSyncRecoveryReadiness } from './windows-a5-pair-sync-recovery-readiness.mjs';

function result(prefix, value, code = 0) {
  return { code, output: `${prefix}${JSON.stringify(value)}\n`, stdout: `${prefix}${JSON.stringify(value)}\n` };
}

const pairing = {
  activeSyncGroupMemberCount: 2,
  deviceIdentityFingerprint: 'c6b193a8d1f83849',
  dirtyRecordCount: 0,
  missingPrerequisites: [],
  nodeCount: 1299,
  pairingCredentialsPresent: true,
  pairingCredentialsRejected: false,
  pairingPeerConflict: false,
  remotePeerFingerprint: '82cc2dc5c98135c8',
  resultStatus: 'ready',
  schemaVersion: 1,
  syncGroupCredentialsPresent: true,
  syncGroupId: 'group-1',
  syncGroupPeerConflict: false,
  syncGroupRemotePeerPendingDeliveryCount: 0,
  syncGroupRemotePeerFingerprint: '82cc2dc5c98135c8',
  syncGroupTimelineId: 'timeline-1'
};

it('accepts an empty paired workspace from Sync Group facts without Capture prerequisites', async () => {
  const run = vi.fn().mockResolvedValueOnce(
    result('[android-data] pair-sync-recovery-readiness=', { ...pairing, nodeCount: 0 })
  );

  await expect(postPairSyncRecoveryReadiness({
    deviceFingerprint: pairing.deviceIdentityFingerprint,
    env: {},
    paths: { adbPath: '/adb', repoRoot: '/repo', systemNode: '/node' },
    run,
    serial: 'fixed-a5'
  })).resolves.toMatchObject({ readiness: {
    dirtyRecordCount: 0, nodeCount: 0, pairingCredentialsPresent: true,
    syncGroupId: 'group-1', syncGroupTimelineId: 'timeline-1'
  } });
  expect(run).toHaveBeenCalledTimes(1);
  expect(run.mock.calls[0][1][0]).toContain('android-pair-sync-recovery-readiness-runner.mjs');
});

it('accepts convergence from Sync Group credentials without legacy pairing credentials', async () => {
  const run = vi.fn().mockResolvedValueOnce(
    result('[android-data] pair-sync-recovery-readiness=', {
      ...pairing, pairingCredentialsPresent: false, remotePeerFingerprint: null
    })
  );

  await expect(postPairSyncRecoveryReadiness({
    deviceFingerprint: pairing.deviceIdentityFingerprint,
    env: {},
    paths: { adbPath: '/adb', repoRoot: '/repo', systemNode: '/node' },
    run,
    serial: 'fixed-a5'
  })).resolves.toMatchObject({ readiness: { syncGroupCredentialsPresent: true } });
});

it('rejects a UI-complete run whose dirty records did not receive acknowledgements', async () => {
  const run = vi.fn()
    .mockResolvedValueOnce(result('[android-data] pair-sync-recovery-readiness=', {
      ...pairing, dirtyRecordCount: 6, resultStatus: 'approval_required',
      syncGroupRemotePeerPendingDeliveryCount: 1,
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
    syncGroupRemotePeerPendingDeliveryCount: 1,
    missingPrerequisites: ['unsynced_device_data_requires_review']
  }, 77);
  const run = vi.fn()
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

it('quiesces database writers only while each readiness snapshot is collected', async () => {
  const events = [];
  const run = vi.fn().mockImplementation(async () => {
    events.push('snapshot');
    return result('[android-data] pair-sync-recovery-readiness=', pairing);
  });

  await postPairSyncRecoveryReadiness({
    afterSnapshot: async () => events.push('provider-resumed'),
    beforeSnapshot: async () => events.push('provider-stopped'),
    deviceFingerprint: pairing.deviceIdentityFingerprint,
    env: {}, paths: { adbPath: '/adb', repoRoot: '/repo', systemNode: '/node' },
    run, serial: 'fixed-a5'
  });

  expect(events).toEqual(['provider-stopped', 'snapshot', 'provider-resumed']);
});

it('gives the foreground provider a sync window before a managed stopped snapshot', async () => {
  const events = [];
  const run = vi.fn(async (command, args) => {
    if (command === '/node') {
      events.push('snapshot');
      return result('[android-data] pair-sync-recovery-readiness=', pairing);
    }
    events.push(args.includes('force-stop') ? 'stopped' : 'resumed');
    return result('', {});
  });
  await postPairSyncRecoveryReadiness({
    adbPort: '5037', deviceFingerprint: pairing.deviceIdentityFingerprint, env: {},
    paths: { adbPath: '/adb', repoRoot: '/repo', systemNode: '/node' },
    quiesceProvider: true, run, serial: 'fixed-a5',
    wait: async (milliseconds) => events.push(`settled-${milliseconds}`)
  });
  expect(events).toEqual(['settled-8000', 'stopped', 'snapshot', 'resumed']);
});

it('accepts current Mac convergence while another active member remains pending', async () => {
  const run = vi.fn().mockResolvedValueOnce(result(
    '[android-data] pair-sync-recovery-readiness=', {
      ...pairing, dirtyRecordCount: 1, resultStatus: 'approval_required',
      missingPrerequisites: ['unsynced_device_data_requires_review']
    }, 77
  ));

  await expect(postPairSyncRecoveryReadiness({
    deviceFingerprint: pairing.deviceIdentityFingerprint,
    env: {}, maxAttempts: 1,
    paths: { adbPath: '/adb', repoRoot: '/repo', systemNode: '/node' },
    run, serial: 'fixed-a5'
  })).resolves.toMatchObject({ readiness: {
    dirtyRecordCount: 1, syncGroupRemotePeerPendingDeliveryCount: 0
  } });
});

it('waits for the preserved database to reopen after Android process restart', async () => {
  const starting = result('[android-data] pair-sync-recovery-readiness=', {
    ...pairing,
    deviceIdentityFingerprint: null, dirtyRecordCount: null,
    missingPrerequisites: ['database_unavailable'], nodeCount: null,
    resultStatus: 'approval_required'
  }, 77);
  const run = vi.fn()
    .mockRejectedValueOnce(Object.assign(new Error('exit 77'), { result: starting }))
    .mockResolvedValueOnce(result('[android-data] pair-sync-recovery-readiness=', pairing));

  await expect(postPairSyncRecoveryReadiness({
    deviceFingerprint: pairing.deviceIdentityFingerprint,
    env: {}, maxAttempts: 2,
    paths: { adbPath: '/adb', repoRoot: '/repo', systemNode: '/node' },
    run, serial: 'fixed-a5', wait: vi.fn()
  })).resolves.toMatchObject({ readiness: { dirtyRecordCount: 0 } });
});

it.each([
  { label: 'active group membership', override: { activeSyncGroupMemberCount: 1 } },
  { label: 'group credentials', override: { syncGroupCredentialsPresent: false } },
  { label: 'unique group peer', override: { syncGroupPeerConflict: true } },
  { label: 'group identity', override: { syncGroupId: null } },
  { label: 'group timeline', override: { syncGroupTimelineId: null } }
])('rejects convergence without $label', async ({ override }) => {
  const run = vi.fn().mockResolvedValueOnce(
    result('[android-data] pair-sync-recovery-readiness=', { ...pairing, ...override })
  );

  await expect(postPairSyncRecoveryReadiness({
    deviceFingerprint: pairing.deviceIdentityFingerprint,
    env: {}, maxAttempts: 1,
    paths: { adbPath: '/adb', repoRoot: '/repo', systemNode: '/node' },
    run, serial: 'fixed-a5'
  })).rejects.toMatchObject({ stage: 'post-sync-convergence' });
});
