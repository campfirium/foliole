import { z } from 'zod';

import type { DbPort } from '../../../../../../lib/core/sync/dbPort.js';
import type { NativeCompanionFramedSyncInventoryRequest } from '../../../../../../lib/platform/nativeCompanionSyncContract.js';
import { runCompanionSyncWriterTask } from '../../../companionSyncWriterQueue.js';
import { getIosCompanionDatabaseOwner } from '../../runtime/iosCompanionDatabaseBootstrap.js';

import { resumeCompanionFramedSyncPendingPublications } from './companionFramedSyncPendingPublications.js';

const peerContext = z.object({ group_id: z.string().min(1),
  peer_device_id: z.string().min(1), peer_library_epoch: z.string().min(1) });
type PeerContext = z.infer<typeof peerContext>;

function routeKey(peer: PeerContext) {
  return `framed_sync_peer_route:${JSON.stringify([
    peer.group_id, peer.peer_device_id, peer.peer_library_epoch])}`;
}

/** Persist only a route whose authenticated inventory exchange has already succeeded. */
export async function rememberCompanionFramedSyncPeerRoute(args: NativeCompanionFramedSyncInventoryRequest) {
  const key = routeKey({ group_id: args.sync_group_id, peer_device_id: args.receiver_device_id,
    peer_library_epoch: args.receiver_library_epoch });
  await runCompanionSyncWriterTask(() => getIosCompanionDatabaseOwner().runWriter((db) =>
    db.run(`INSERT INTO companion_meta (key, value, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [key, args.endpoint_url, new Date().toISOString()])));
}

export async function readCompanionFramedSyncPeerRoute(db: DbPort, peer: PeerContext) {
  const [row] = await db.query<{ value: string }>(
    'SELECT value FROM companion_meta WHERE key = ?', [routeKey(peer)]);
  return row?.value ?? null;
}

/** An incoming authenticated inventory resumes only an existing exact peer route. */
export async function resumeCompanionFramedSyncRespondingPeer(payload: Record<string, unknown>) {
  if (payload.peer_device_id === undefined) return;
  const peer = peerContext.parse(payload);
  const endpoint = await getIosCompanionDatabaseOwner().read((db) =>
    readCompanionFramedSyncPeerRoute(db, peer));
  if (endpoint) await resumeCompanionFramedSyncPendingPublications({ endpoint_url: endpoint,
    receiver_device_id: peer.peer_device_id, receiver_library_epoch: peer.peer_library_epoch,
    sync_group_id: peer.group_id });
}
