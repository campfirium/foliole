import { createHash } from 'node:crypto';

import Database from 'better-sqlite3';

import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { canonicalContentId, canonicalTransferId } from '../../lib/core/sync/framedSyncCanonicalManifest.js';
import { type FramedSyncContext, FRAMED_SYNC_PROTOCOL_VERSION } from '../../lib/core/sync/framedSyncContract.js';
import { createFramedSyncOutboundStaging } from '../../lib/core/sync/framedSyncOutboundStaging.js';
import { createSyncGroupDeviceIdentity } from '../../lib/platform/syncGroupUnifiedContract.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { createDesktopSyncGroup, registerSyncGroupDevice } from './syncGroupStore.js';

export const identities = [1, 2, 3].map((index) => createSyncGroupDeviceIdentity({
  device_anchor: `${index.toString().repeat(8)}-1111-4111-8111-111111111111`,
  group_id: 'group-removal', library_path: `/library/${index}`, path_flavor: 'posix'
}));

export function openMemberDatabase(file: string, index: number, bind: (db: Database.Database) => void) {
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  initializeDatabaseSchema(db);
  bind(db);
  createDesktopSyncGroup({ device: identities[index]!, deviceName: String(index),
    platform: 'desktop', workgroupKey: Buffer.alloc(32, 7).toString('base64url') });
  for (const [peerIndex, device] of identities.entries()) if (peerIndex !== index) {
    registerSyncGroupDevice({ device, deviceName: String(peerIndex), platform: 'desktop' });
  }
  return db;
}

export async function publishMemberDelivery(db: Database.Database, receiverIndex: number,
  groupId = 'group-removal', senderId = identities[0]!.identity_key, receiverEpoch = 'receiver-epoch') {
  const hash = new Uint8Array(createHash('sha256').update('protected-content').digest());
  const manifest = { blobs: [], facts: [{ blobs: [], body: [], factId: 'original-fact',
    globalId: 'original-object', kind: 1, objectType: 'node', sharedStateHash: hash }] };
  const context: FramedSyncContext = { groupId, protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
    senderDeviceId: senderId, senderLibraryEpoch: 'sender-epoch',
    receiverDeviceId: identities[receiverIndex]!.identity_key, receiverLibraryEpoch: receiverEpoch };
  const contentId = await canonicalContentId(manifest);
  const transferId = await canonicalTransferId(context, contentId);
  await createFramedSyncOutboundStaging(createBetterSqliteDbPort(db)).publishOutbound({
    contentId, context, manifest, manifestHash: contentId, transferId });
  return Buffer.from(transferId).toString('hex');
}

export function heldTransfers(db: Database.Database) {
  return db.prepare('SELECT lower(hex(transfer_id)) AS id FROM framed_sync_outbound_holds ORDER BY id')
    .all().map((row) => {
      if (!row || typeof row !== 'object' || !('id' in row) || typeof row.id !== 'string') {
        throw new Error('fixture_hold_invalid');
      }
      return row.id;
    });
}
