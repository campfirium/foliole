import { describe, expect, it, vi } from 'vitest';

import {
  assertMacosA5ProductBootstrap, runMacosA5PairSyncPreflight
} from './macos-a5-pair-sync-preflight.mjs';

const pairing = {
  deviceIdentityFingerprint: 'bd1d679fbb55b53e',
  dirtyRecordCount: 0,
  nodeCount: 0,
  pairingCredentialsPresent: true,
  pairingCredentialsRejected: false,
  pairingPeerConflict: false,
  remotePeerFingerprint: '82cc2dc5c98135c8'
};
const workspace = {
  counts: { content_blobs: 0, node_order: 0, nodes: 0 },
  pairingWorkspace: { localDeviceIdentityPresent: true, syncEndpointPresent: false }
};

function result(prefix, value, status) {
  return { status, stderr: '', stdout: `${prefix}${JSON.stringify(value)}\n` };
}

describe('macOS A5 one-time pair sync preflight', () => {
  it('allows only a missing database that can preserve the proven paired device identity', () => {
    const missingPairing = {
      ...pairing,
      deviceIdentityFingerprint: null, dirtyRecordCount: null, nodeCount: null,
      missingPrerequisites: ['database_unavailable'], resultStatus: 'approval_required',
      storedDeviceFingerprint: 'c6b193a8d1f83849'
    };
    const missingWorkspace = {
      ...workspace,
      counts: { content_blobs: null, node_order: null, nodes: null },
      missingPrerequisites: ['database_missing'], resultStatus: 'approval_required',
      pairingWorkspace: { localDeviceIdentityPresent: false, syncEndpointPresent: false }
    };
    const run = vi.fn()
      .mockReturnValueOnce(result('[android-data] pair-sync-recovery-readiness=', missingPairing, 77))
      .mockReturnValueOnce(result('[android-data] capture-annotation-readiness=', missingWorkspace, 77));

    expect(runMacosA5PairSyncPreflight({ adb: '/adb', repoRoot: '/repo' }, run))
      .toMatchObject({ existingPairing: true, requiresProductBootstrap: true });
  });

  it('rejects product bootstrap unless the recreated database keeps the stored identity', () => {
    const before = { requiresProductBootstrap: true, storedDeviceFingerprint: 'c6b193a8d1f83849' };
    expect(() => assertMacosA5ProductBootstrap(before, {
      deviceIdentityFingerprint: 'different-id', requiresProductBootstrap: false
    })).toThrow('did not preserve');
    expect(assertMacosA5ProductBootstrap(before, {
      deviceIdentityFingerprint: 'c6b193a8d1f83849', requiresProductBootstrap: false
    })).toMatchObject({ deviceIdentityFingerprint: 'c6b193a8d1f83849' });
  });

  it('accepts only the authorized empty stale-pairing shape', () => {
    const run = vi.fn()
      .mockReturnValueOnce(result('[android-data] pair-sync-recovery-readiness=', pairing, 0))
      .mockReturnValueOnce(result('[android-data] capture-annotation-readiness=', workspace, 77));

    expect(runMacosA5PairSyncPreflight({ adb: '/adb', repoRoot: '/repo' }, run))
      .toMatchObject(pairing);
  });

  it('accepts a strictly empty fresh device', () => {
    const run = vi.fn()
      .mockReturnValueOnce(result('[android-data] pair-sync-recovery-readiness=', {
        ...pairing, pairingCredentialsPresent: false, remotePeerFingerprint: null
      }, 0))
      .mockReturnValueOnce(result('[android-data] capture-annotation-readiness=', workspace, 77));

    expect(runMacosA5PairSyncPreflight({ adb: '/adb', repoRoot: '/repo' }, run))
      .toMatchObject({ existingPairing: false, nodeCount: 0 });
  });

  it('rejects an unpaired device with orphaned workspace data', () => {
    const run = vi.fn()
      .mockReturnValueOnce(result('[android-data] pair-sync-recovery-readiness=', {
        ...pairing, pairingCredentialsPresent: false, remotePeerFingerprint: null
      }, 0))
      .mockReturnValueOnce(result('[android-data] capture-annotation-readiness=', {
        ...workspace, counts: { ...workspace.counts, content_blobs: 1 }
      }, 77));

    expect(() => runMacosA5PairSyncPreflight({ adb: '/adb', repoRoot: '/repo' }, run))
      .toThrow('authorized pair-switch state');
  });

  it('allows a fully synced clean workspace to move from a temporary to the daily DEV profile', () => {
    const run = vi.fn()
      .mockReturnValueOnce(result('[android-data] pair-sync-recovery-readiness=', {
        ...pairing, nodeCount: 1293
      }, 0))
      .mockReturnValueOnce(result('[android-data] capture-annotation-readiness=', {
        ...workspace,
        canonicalInbox: { active: true, kind: 'folder' },
        counts: { content_blobs: 2033, node_order: 969, nodes: 1293 },
        pairingWorkspace: { localDeviceIdentityPresent: true, syncEndpointPresent: true }
      }, 0));

    expect(runMacosA5PairSyncPreflight({ adb: '/adb', repoRoot: '/repo' }, run))
      .toMatchObject({ existingPairing: true, nodeCount: 1293 });
  });

  it('repairs a clean synced workspace after the desktop rejects and clears its credentials', () => {
    const run = vi.fn()
      .mockReturnValueOnce(result('[android-data] pair-sync-recovery-readiness=', {
        ...pairing,
        dirtyRecordCount: 0,
        nodeCount: 1293,
        pairingCredentialRejectionReason: 'unknown_device',
        pairingCredentialsPresent: false,
        pairingCredentialsRejected: true,
        remotePeerFingerprint: null,
        resultStatus: 'approval_required'
      }, 77))
      .mockReturnValueOnce(result('[android-data] capture-annotation-readiness=', {
        ...workspace,
        canonicalInbox: { active: true, kind: 'folder' },
        counts: { content_blobs: 2033, node_order: 969, nodes: 1293 },
        pairingWorkspace: { localDeviceIdentityPresent: true, syncEndpointPresent: false }
      }, 0));

    expect(runMacosA5PairSyncPreflight({ adb: '/adb', repoRoot: '/repo' }, run))
      .toMatchObject({ existingPairing: false, nodeCount: 1293 });
  });

  it('repairs a clean synced workspace while the rejected credentials are still readable', () => {
    const run = vi.fn()
      .mockReturnValueOnce(result('[android-data] pair-sync-recovery-readiness=', {
        ...pairing,
        dirtyRecordCount: 0,
        nodeCount: 1293,
        pairingCredentialRejectionReason: 'unknown_device',
        pairingCredentialsRejected: true,
        resultStatus: 'ready'
      }, 0))
      .mockReturnValueOnce(result('[android-data] capture-annotation-readiness=', {
        ...workspace,
        canonicalInbox: { active: true, kind: 'folder' },
        counts: { content_blobs: 2033, node_order: 969, nodes: 1293 },
        pairingWorkspace: { localDeviceIdentityPresent: true, syncEndpointPresent: true }
      }, 0));

    expect(runMacosA5PairSyncPreflight({ adb: '/adb', repoRoot: '/repo' }, run))
      .toMatchObject({ existingPairing: false, nodeCount: 1293 });
  });

  it('formally re-pairs a clean synced workspace when local Sync Group signing is unavailable', () => {
    const run = vi.fn()
      .mockReturnValueOnce(result('[android-data] pair-sync-recovery-readiness=', {
        ...pairing,
        dirtyRecordCount: 0,
        nodeCount: 1293,
        pairingCredentialRejectionReason: 'local_signing_unavailable',
        pairingCredentialsRejected: true,
        resultStatus: 'ready'
      }, 0))
      .mockReturnValueOnce(result('[android-data] capture-annotation-readiness=', {
        ...workspace,
        canonicalInbox: { active: true, kind: 'folder' },
        counts: { content_blobs: 2033, node_order: 969, nodes: 1293 },
        pairingWorkspace: { localDeviceIdentityPresent: true, syncEndpointPresent: true }
      }, 0));

    expect(runMacosA5PairSyncPreflight({ adb: '/adb', repoRoot: '/repo' }, run))
      .toMatchObject({ credentialRepairRequired: true, existingPairing: false, nodeCount: 1293 });
  });

  it('re-pairs an empty preserved identity after the product records a generic 401', () => {
    const run = vi.fn()
      .mockReturnValueOnce(result('[android-data] pair-sync-recovery-readiness=', {
        ...pairing,
        pairingCredentialRejectionReason: null,
        pairingCredentialsRejected: true,
        resultStatus: 'ready',
        storedDeviceFingerprint: pairing.deviceIdentityFingerprint
      }, 0))
      .mockReturnValueOnce(result('[android-data] capture-annotation-readiness=', {
        ...workspace,
        pairingWorkspace: { localDeviceIdentityPresent: true, syncEndpointPresent: true }
      }, 77));

    expect(runMacosA5PairSyncPreflight({ adb: '/adb', repoRoot: '/repo' }, run))
      .toMatchObject({ credentialRepairRequired: true, existingPairing: true, nodeCount: 0 });
  });

  it('resumes initial sync for an empty Device already joined to the Group', () => {
    const run = vi.fn()
      .mockReturnValueOnce(result('[android-data] pair-sync-recovery-readiness=', {
        ...pairing, activeSyncGroupMemberCount: 3, syncGroupId: 'group-1',
        syncGroupTimelineId: 'timeline-1'
      }, 0))
      .mockReturnValueOnce(result('[android-data] capture-annotation-readiness=', {
        ...workspace, pairingWorkspace: { localDeviceIdentityPresent: true, syncEndpointPresent: true }
      }, 77));
    expect(runMacosA5PairSyncPreflight({ adb: '/adb', repoRoot: '/repo' }, run))
      .toMatchObject({ existingPairing: true, nodeCount: 0 });
  });

  it('rejects a generic 401 when the empty workspace has no proven sync endpoint', () => {
    const run = vi.fn()
      .mockReturnValueOnce(result('[android-data] pair-sync-recovery-readiness=', {
        ...pairing, pairingCredentialsRejected: true, resultStatus: 'ready'
      }, 0))
      .mockReturnValueOnce(result('[android-data] capture-annotation-readiness=', workspace, 77));

    expect(() => runMacosA5PairSyncPreflight({ adb: '/adb', repoRoot: '/repo' }, run))
      .toThrow('authorized pair-switch state');
  });

  it('preserves a proven existing pairing while authorized dirty data is pushed first', () => {
    const run = vi.fn()
      .mockReturnValueOnce(result('[android-data] pair-sync-recovery-readiness=', {
        ...pairing, dirtyRecordCount: 6, nodeCount: 1299, resultStatus: 'approval_required'
      }, 77))
      .mockReturnValueOnce(result('[android-data] capture-annotation-readiness=', {
        ...workspace,
        canonicalInbox: { active: true, kind: 'folder' },
        counts: { content_blobs: 2039, node_order: 975, nodes: 1299 },
        pairingWorkspace: { localDeviceIdentityPresent: true, syncEndpointPresent: true }
      }, 0));

    expect(runMacosA5PairSyncPreflight({ adb: '/adb', repoRoot: '/repo' }, run))
      .toMatchObject({ dirtyRecordCount: 6, existingPairing: true, nodeCount: 1299 });
  });

  it('authorizes credential repair only for an existing dirty pairing with a proven 401', () => {
    const run = vi.fn()
      .mockReturnValueOnce(result('[android-data] pair-sync-recovery-readiness=', {
        ...pairing, dirtyRecordCount: 1, nodeCount: 1299,
        pairingCredentialsRejected: true, resultStatus: 'approval_required'
      }, 77))
      .mockReturnValueOnce(result('[android-data] capture-annotation-readiness=', {
        ...workspace,
        canonicalInbox: { active: true, kind: 'folder' },
        counts: { content_blobs: 2039, node_order: 975, nodes: 1299 },
        pairingWorkspace: { localDeviceIdentityPresent: true, syncEndpointPresent: true }
      }, 0));

    expect(runMacosA5PairSyncPreflight({ adb: '/adb', repoRoot: '/repo' }, run))
      .toMatchObject({ credentialRepairRequired: true, existingPairing: true });
  });
});
