import type { DbPort } from '../../lib/core/sync/dbPort.js';
import { compareFramedSyncInventories } from '../../lib/core/sync/framedSyncInventory.js';
import type { FramedSyncStagingPort } from '../../lib/core/sync/framedSyncStagingPort.js';

import { createDesktopFramedSyncRoundEndpoint, type DesktopFramedSyncRoundIdentity } from './desktopFramedSyncRoundEndpoint.js';

type Input = Readonly<{
  db: DbPort;
  groupId: string;
  groupSecret: string;
  local: DesktopFramedSyncRoundIdentity;
  nodeId?: string;
  peerOrigin: string;
  remote: DesktopFramedSyncRoundIdentity;
  staging: FramedSyncStagingPort;
}>;

/** The single-object process port selects metadata; production publication owns all body ranges. */
export async function synchronizeVerifiedDesktopFramedSync(input: Input) {
  const nodeId = input.nodeId ?? (await input.db.query<{ object_id: string }>(
    `SELECT v.object_id FROM node_sync_versions v JOIN nodes n ON n.id = v.object_id
     ORDER BY v.created_at, v.version_id LIMIT 1`))[0]?.object_id;
  if (!nodeId) throw new Error('framed_sync_source_empty');
  const endpoint = createDesktopFramedSyncRoundEndpoint({ ...input,
    bodyStorage: 'chunked', peer: input.remote });
  const current = await endpoint.readInventoryEntry({ globalId: nodeId, objectType: 'node' });
  if (!current) throw new Error('framed_sync_source_empty');
  const difference = compareFramedSyncInventories({ local: [current], remote: [] })[0];
  if (!difference) throw new Error('framed_sync_source_empty');
  const selection = await endpoint.selectOutbound(difference);
  if (selection.kind === 'deferred') throw new Error('framed_sync_source_changed');
  await endpoint.staging.publishOutbound(selection.publication);
  await endpoint.sendPublishedTransfer({ difference, publication: selection.publication, receiver: 'remote' });
  return { transferId: Buffer.from(selection.publication.transferId).toString('hex') };
}
