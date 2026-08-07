import { describe, expect, it, vi } from 'vitest';

import { runMacosA5PairSyncPreflight } from './macos-a5-pair-sync-preflight.mjs';

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
  it('accepts only the authorized empty stale-pairing shape', () => {
    const run = vi.fn()
      .mockReturnValueOnce(result('[android-data] pair-sync-recovery-readiness=', pairing, 0))
      .mockReturnValueOnce(result('[android-data] capture-annotation-readiness=', workspace, 77));

    expect(runMacosA5PairSyncPreflight({ adb: '/adb', repoRoot: '/repo' }, run))
      .toMatchObject(pairing);
  });

  it('rejects a clean unpaired device because the authorization was for stale pairing removal', () => {
    const run = vi.fn()
      .mockReturnValueOnce(result('[android-data] pair-sync-recovery-readiness=', {
        ...pairing, pairingCredentialsPresent: false, remotePeerFingerprint: null
      }, 0))
      .mockReturnValueOnce(result('[android-data] capture-annotation-readiness=', workspace, 77));

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
      .toMatchObject({ existingPairing: false, nodeCount: 1293 });
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
