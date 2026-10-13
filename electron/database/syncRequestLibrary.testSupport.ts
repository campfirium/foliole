import { randomUUID } from 'node:crypto';
import path from 'node:path';

import { FRAMED_SYNC_PROTOCOL_VERSION } from '../../lib/core/sync/framedSyncContract.js';
import { compareFramedSyncInventories } from '../../lib/core/sync/framedSyncInventory.js';
import { readFramedSyncInventory } from '../../lib/core/sync/framedSyncInventoryRead.js';
import { collectNodeVersionPayloads } from '../../lib/core/sync/nodeVersionPayloadCollector.js';
import { withRequestSyncFiles } from '../../lib/core/sync/requestSyncFiles.js';
import { applyRequestSyncObject } from '../../lib/core/sync/requestSyncObjectApply.js';
import { writeRequestSyncSnapshot } from '../../lib/core/sync/requestSyncSnapshot.js';
import { createDesktopFramedSyncFiles } from '../sync/desktopFramedSyncFiles.js';

import { root, type Peer } from './syncEmptyLibraryTestSupport.js';
import { receiveMemberPosition } from './syncMemberPosition.testSupport.js';

function proof(peer: Peer) {
  return peer.db.prepare<[], { library_epoch: string; proof_revision: number }>(
    'SELECT library_epoch, proof_revision FROM node_version_local_proof_state WHERE singleton_id = 1'
  ).get()!;
}

/** Transfer actual inventory differences through the production snapshot and object transaction. */
export async function syncRequestLibrary(source: Peer, target: Peer) {
  const differences = compareFramedSyncInventories({
    local: await readFramedSyncInventory(source.port), remote: await readFramedSyncInventory(target.port)
  }).filter(value => value.direction === 'local_to_remote');
  const files = createDesktopFramedSyncFiles(path.join(root, `request-${randomUUID()}`));
  for (const difference of differences) await withRequestSyncFiles(files, async request => {
    await writeRequestSyncSnapshot(source.port, difference, request);
    const sender = proof(source);
    await applyRequestSyncObject(target.port, {
      context: { groupId: 'group', protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
        senderDeviceId: source.id, senderLibraryEpoch: sender.library_epoch,
        receiverDeviceId: target.id, receiverLibraryEpoch: proof(target).library_epoch },
      peerState: { contract_version: 3, group_id: 'group', sender_device_identity_key: source.id,
        ...sender, devices: [], removals: [], restore: null, source_proof_revisions: {} },
      globalId: difference.globalId, objectType: difference.objectType,
      requestId: new Uint8Array(16), facts: async function* () { yield* request.readFacts(); },
      loadBody: (_db, blob) => request.loadBody(blob), enqueueSearchInvalidations: false
    });
  });
  await receiveMemberPosition(target, source);
  await receiveMemberPosition(source, target);
  await collectNodeVersionPayloads(source.port, 'topic');
}
