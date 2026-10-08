import { bytesToHex } from '@noble/hashes/utils.js';

import { recordFramedSyncResourceAvailability } from '../../../../../../lib/core/database/framedSyncResourceAvailability.js';
import { framedSyncBytes, sameFramedSyncBytes } from '../../../../../../lib/core/database/framedSyncStagingSerialization.js';
import type { DbPort, DbRow } from '../../../../../../lib/core/sync/dbPort.js';
import { canonicalContentId, canonicalTransferId, type CanonicalFact } from '../../../../../../lib/core/sync/framedSyncCanonicalManifest.js';
import { FRAMED_SYNC_PROTOCOL_VERSION, type FramedSyncContext } from '../../../../../../lib/core/sync/framedSyncContract.js';
import { decodeAndValidateProtocolMessage } from '../../../../../../lib/core/sync/framedSyncProtocolCodec.js';
import { completeFramedSyncResourceDemand } from '../../../../../../lib/core/sync/framedSyncResourceDemands.js';
import { FRAMED_SYNC_RESOURCE_FACT_KIND, restoreFramedSyncResourceFact } from '../../../../../../lib/core/sync/framedSyncResourceFact.js';

import type { CompanionFramedSyncApplyInput } from './companionFramedSyncApply.js';
import { STAGING_TABLES } from './companionFramedSyncStagingTables.js';

export function companionFramedResourceUnit(facts: readonly CanonicalFact[]) {
  if (!facts.some((fact) => fact.kind === FRAMED_SYNC_RESOURCE_FACT_KIND)) return null;
  const first = facts[0]!;
  if (facts.some((fact) => fact.kind !== FRAMED_SYNC_RESOURCE_FACT_KIND ||
      fact.globalId !== first.globalId || fact.objectType !== first.objectType)) {
    throw new Error('framed_sync_resource_unit_invalid');
  }
  const resources = facts.map(restoreFramedSyncResourceFact);
  if (new Set(resources.map((entry) => entry.resource.contentHash)).size !== resources.length) {
    throw new Error('framed_sync_resource_unit_invalid');
  }
  return resources;
}

async function resourceContext(db: DbPort, input: CompanionFramedSyncApplyInput, contentId: Uint8Array) {
  const tables = STAGING_TABLES[input.stagingKind];
  const [row] = await db.query<DbRow>(`SELECT authenticated_plaintext
    FROM ${tables.alias}.${tables.prefix}_frames WHERE transfer_id = ? AND frame_type = 2
      AND attempt_id = (SELECT active_attempt_id FROM ${tables.alias}.${tables.prefix}_transfers
        WHERE transfer_id = ?) LIMIT 1`, [input.transferId, input.transferId]);
  if (!row) throw new Error('framed_sync_resource_header_missing');
  const message = decodeAndValidateProtocolMessage(framedSyncBytes(row, 'authenticated_plaintext'), 2);
  const manifest = message.payload.manifest as Record<string, unknown>;
  if (message.payloadCase !== 'transfer_header' || manifest.protocolVersion !== FRAMED_SYNC_PROTOCOL_VERSION ||
      typeof manifest.groupId !== 'string' || !manifest.groupId ||
      !sameFramedSyncBytes(manifest.contentId as Uint8Array, contentId) ||
      !sameFramedSyncBytes(message.payload.transferId as Uint8Array, input.transferId)) {
    throw new Error('framed_sync_resource_header_mismatch');
  }
  const context: FramedSyncContext = { groupId: manifest.groupId, protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
    senderDeviceId: input.senderDeviceId, senderLibraryEpoch: input.senderLibraryEpoch,
    receiverDeviceId: input.receiverDeviceId, receiverLibraryEpoch: input.receiverLibraryEpoch };
  if (!sameFramedSyncBytes(await canonicalTransferId(context, contentId), input.transferId)) {
    throw new Error('framed_sync_resource_header_mismatch');
  }
  return context;
}

/** Native verified pins remain attached and owned throughout the receipt transaction. */
export async function loadCompanionFramedResourceReady(db: DbPort, input: CompanionFramedSyncApplyInput,
  facts: readonly CanonicalFact[], contentId: Uint8Array) {
  const resources = companionFramedResourceUnit(facts);
  if (!resources) return null;
  if (!sameFramedSyncBytes(await canonicalContentId({ facts, blobs: resources.map((entry) => entry.blob) }), contentId)) {
    throw new Error('framed_sync_resource_header_mismatch');
  }
  const tables = STAGING_TABLES[input.stagingKind];
  const rows = await db.query<DbRow>(`SELECT pin.sha256, pin.byte_length, pin.role, pin.required, pin.storage_key,
    available.byte_length AS available_length, available.storage_key AS available_key
    FROM ${tables.alias}.${tables.prefix}_resource_pins pin
    LEFT JOIN ${tables.alias}.${tables.prefix}_available_resources available ON available.sha256 = pin.sha256
    WHERE pin.transfer_id = ?`, [input.transferId]);
  const byHash = new Map(rows.map((row) => [bytesToHex(framedSyncBytes(row, 'sha256')), row]));
  const keys = input.resourceStorageKeys ?? [];
  if (rows.length !== resources.length || byHash.size !== resources.length ||
      new Set(keys).size !== keys.length || keys.length !== resources.length || resources.some((entry) => {
        const row = byHash.get(entry.resource.contentHash);
        return !row || String(row.byte_length) !== entry.blob.byteLength.toString() || row.role !== entry.blob.role ||
          row.required !== 1 || row.storage_key !== entry.resource.storageKey ||
          String(row.available_length) !== entry.blob.byteLength.toString() || row.available_key !== entry.resource.storageKey ||
          !keys.includes(entry.resource.storageKey);
      })) throw new Error('framed_sync_resource_pin_set_mismatch');
  const [bodyPin] = await db.query(`SELECT 1 FROM ${tables.alias}.${tables.prefix}_blob_pins
    WHERE transfer_id = ? LIMIT 1`, [input.transferId]);
  if (bodyPin) throw new Error('framed_sync_resource_pin_set_mismatch');
  return { context: await resourceContext(db, input, contentId), facts, resources };
}

export type CompanionFramedResourceReady = NonNullable<Awaited<ReturnType<typeof loadCompanionFramedResourceReady>>>;

export async function applyCompanionFramedResourceAvailability(db: DbPort, ready: CompanionFramedResourceReady) {
  await recordFramedSyncResourceAvailability(db, ready.resources.map((entry) => entry.resource.contentHash), true);
}

export async function finishCompanionFramedResourceDemand(db: DbPort, input: CompanionFramedSyncApplyInput,
  ready: CompanionFramedResourceReady) {
  for (const fact of ready.facts) await completeFramedSyncResourceDemand(db, ready.context, fact, input.transferId);
}
