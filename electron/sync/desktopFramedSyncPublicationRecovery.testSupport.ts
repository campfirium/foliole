import Database from 'better-sqlite3';
import { z } from 'zod';

import { compareFramedSyncInventories } from '../../lib/core/sync/framedSyncInventory.js';

import type { DesktopFramedSyncFixtureProcess,
  DesktopFramedSyncFixtureSnapshot } from './desktopFramedSyncTwoProcess.testSupport.js';

const bytes = z.instanceof(Uint8Array);
const entries = z.array(z.object({
  frontierFactIds: z.array(z.string()), globalId: z.string(), objectType: z.string(),
  requiredRelationIds: z.array(z.string()), resourceHashes: z.array(bytes),
  reviewFactIds: z.array(z.string()), sharedStateHash: bytes,
  stateFactIds: z.array(z.string()).default([]), versionStates: z.array(z.string()).optional(),
  currentVersionId: z.string().optional(), unready: z.boolean().optional()
}));

export async function readFixtureInventory(process: DesktopFramedSyncFixtureProcess) {
  return entries.parse(await process.invoke('round', { input: { kind: 'read_inventory' } }));
}

export async function publishFixtureDelivery(process: DesktopFramedSyncFixtureProcess,
  peer: DesktopFramedSyncFixtureSnapshot, mode: 'publication' | 'partial' | 'finalised') {
  const local = await readFixtureInventory(process);
  const [difference] = compareFramedSyncInventories({ local, remote: [] });
  if (!difference) throw new Error('fixture_difference_missing');
  const selected = z.object({ kind: z.literal('published'),
    publication: z.object({ transferId: bytes }) }).parse(await process.invoke('round', { input: {
    difference, kind: 'select', peer: { deviceId: peer.deviceId,
      libraryEpoch: `${peer.deviceId}-epoch` }, peerOrigin: peer.origin
  } }));
  const transferId = Buffer.from(selected.publication.transferId).toString('hex');
  if (mode !== 'publication') await process.invoke('round', { input: {
    kind: 'prepare_interrupted', mode, transferId
  } });
  return transferId;
}

export function reconnectFixturePeer(process: DesktopFramedSyncFixtureProcess,
  peer: DesktopFramedSyncFixtureSnapshot) {
  return process.invoke('round', { input: { kind: 'reconcile',
    peer: { deviceId: peer.deviceId, libraryEpoch: `${peer.deviceId}-epoch` }, peerOrigin: peer.origin
  } });
}

export function publicationEvidence(databasePath: string) {
  const db = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    return {
      publications: db.prepare(`SELECT lower(hex(transfer_id)) AS id, manifest_json, receiver_device_id,
        state FROM framed_sync_outbound_publications ORDER BY rowid`).all(),
      holds: db.prepare('SELECT member_id FROM framed_sync_outbound_holds ORDER BY member_id').all(),
      receipts: db.prepare<[], { id: string; receiver_device_id: string }>(`SELECT lower(hex(transfer_id)) AS id, receiver_device_id
        FROM framed_sync_receipts ORDER BY rowid`).all(),
      attempts: db.prepare(`SELECT lower(hex(attempt_id)) AS id, state
        FROM framed_sync_outbound_attempts WHERE purpose = 'transfer' ORDER BY rowid`).all(),
      frames: db.prepare(`SELECT lower(hex(attempt_id)) AS id, sequence, ciphertext
        FROM framed_sync_outbound_frames WHERE purpose = 'transfer' ORDER BY rowid`).all(),
      bodies: db.prepare('SELECT hash FROM content_blob_data ORDER BY hash').all()
    };
  } finally { db.close(); }
}
