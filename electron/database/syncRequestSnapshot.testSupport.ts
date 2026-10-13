import path from 'node:path';

import { FRAMED_SYNC_PROTOCOL_VERSION } from '../../lib/core/sync/framedSyncContract.js';
import { compareFramedSyncInventories } from '../../lib/core/sync/framedSyncInventory.js';
import { readFramedSyncInventory } from '../../lib/core/sync/framedSyncInventoryRead.js';
import { RequestSyncFiles } from '../../lib/core/sync/requestSyncFiles.js';
import { applyRequestSyncObject } from '../../lib/core/sync/requestSyncObjectApply.js';
import { writeRequestSyncSnapshot } from '../../lib/core/sync/requestSyncSnapshot.js';
import { createDesktopFramedSyncFiles } from '../sync/desktopFramedSyncFiles.js';

import { root, type Peer } from './syncLibrary.testSupport.js';

export async function withLibraryRequestSnapshot(source: Peer, target: Peer,
  execute: (replay: () => Promise<void>) => Promise<void>) {
  const differences = compareFramedSyncInventories({ local: await readFramedSyncInventory(source.port),
    remote: await readFramedSyncInventory(target.port) }).filter(value => value.direction === 'local_to_remote');
  const files = createDesktopFramedSyncFiles(path.join(root, `snapshot-${crypto.randomUUID()}`));
  const requests = differences.map(() => new RequestSyncFiles(files, `requests/${crypto.randomUUID()}`));
  const proof = source.db.prepare<[], { library_epoch: string; proof_revision: number }>(
    'SELECT library_epoch, proof_revision FROM node_version_local_proof_state').get()!;
  const targetEpoch = String(target.db.prepare('SELECT library_epoch FROM node_version_local_proof_state').pluck().get());
  try {
    for (const [index, difference] of differences.entries()) {
      await writeRequestSyncSnapshot(source.port, difference, requests[index]!);
    }
    await execute(async () => {
      for (const [index, difference] of differences.entries()) {
        const request = requests[index]!;
        await applyRequestSyncObject(target.port, {
          context: { groupId: 'group', protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
            senderDeviceId: source.id, senderLibraryEpoch: proof.library_epoch,
            receiverDeviceId: target.id, receiverLibraryEpoch: targetEpoch },
          peerState: { contract_version: 3, group_id: 'group', sender_device_identity_key: source.id,
            ...proof, devices: [], removals: [], restore: null, source_proof_revisions: {} },
          globalId: difference.globalId, objectType: difference.objectType, requestId: new Uint8Array(16),
          facts: () => request.readFacts(), loadBody: (_db, blob) => request.loadBody(blob), enqueueSearchInvalidations: false
        });
      }
    });
  } finally { await Promise.all(requests.map(request => request.close())); }
}
