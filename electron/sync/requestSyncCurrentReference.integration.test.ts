// @vitest-environment node
import { expect, it } from 'vitest';

import { applyRequestSyncObject } from '../../lib/core/sync/requestSyncObjectApply.js';
import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor.js';
import { context, restoreFixture } from '../database/requestSyncRestoreRecovery.testSupport.js';

import { business, branch } from './syncPackStoredVersionDependencies.testSupport.js';

it.each(['absent', 'foreign'])('rejects an unavailable or cross-object current reference atomically: %s', async reference => {
  const fixture = await restoreFixture();
  try {
    const source = fixture.peer('source');
    const target = fixture.peer('target');
    await applySyncNodesWithDbPort(target.db, [branch('own', 'Current')]);
    const foreign = branch('foreign', 'Another object');
    foreign.object_id = 'other'; foreign.snapshot.id = 'other';
    await applySyncNodesWithDbPort(target.db, [foreign]);
    const before = business(target);
    await expect(applyRequestSyncObject(target.db, {
      context: context({ groupId: 'group', overwriteId: 'unused', providerDeviceId: source.id,
        providerLibraryEpoch: source.epoch, receiverDeviceId: target.id, receiverLibraryEpoch: target.epoch }),
      peerState: { contract_version: 3, group_id: 'group', sender_device_identity_key: source.id,
        library_epoch: source.epoch, proof_revision: 0, source_proof_revisions: {}, devices: [], removals: [], restore: null },
      objectType: 'node', globalId: 'node-1', currentVersionId: reference, requestId: new Uint8Array(16),
      facts: async function* () {}, loadBody: async () => { throw new Error('unexpected_body_load'); }
    })).rejects.toThrow('request_sync_current_version_unavailable');
    expect(business(target)).toEqual(before);
  } finally { await fixture.close(); }
});
