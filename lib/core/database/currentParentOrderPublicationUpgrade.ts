import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { z } from 'zod';

import { currentParentOrderHash, currentParentOrderPayload, type ParentOrderSource } from '../sync/currentParentOrder.js';
import type { DbRow } from '../sync/dbPort.js';
import { canonicalManifestBytes, canonicalTransferIdSync, type CanonicalFact,
  type CanonicalManifest } from '../sync/framedSyncCanonicalManifest.js';
import { FRAMED_SYNC_PROTOCOL_VERSION, type FramedSyncContext } from '../sync/framedSyncContract.js';
import { recoverLegacyPublicationInventory } from '../sync/framedSyncLegacyPublicationInventory.js';
import { encodePublicationInventory } from '../sync/framedSyncPublicationInventory.js';

import { decodeFramedSyncManifest, framedSyncBytes, framedSyncText } from './framedSyncStagingSerialization.js';

const retiredTypes = new Set(['order_version', 'parent_order_position', 'parent_child_order']);

function upgradedOrderFact(parentId: string, sources: readonly ParentOrderSource[]): CanonicalFact {
  const contentHash = currentParentOrderHash(parentId, sources);
  return { kind: 1, objectType: 'parent_child_order', globalId: parentId,
    factId: `parent_child_order:${contentHash}`, sharedStateHash: hexToBytes(contentHash), blobs: [], body: [
      { name: 'content_hash', value: { kind: 'string', value: contentHash } },
      { name: 'current_version_id', value: { kind: 'null' } },
      { name: 'deleted_at', value: { kind: 'null' } },
      { name: 'payload_json', value: { kind: 'string', value: JSON.stringify(currentParentOrderPayload(parentId, sources)) } },
      { name: 'updated_at', value: { kind: 'string', value: '1970-01-01T00:00:00.000Z' } }
    ] };
}

function context(row: DbRow): FramedSyncContext {
  return { protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION, groupId: framedSyncText(row, 'group_id'),
    senderDeviceId: framedSyncText(row, 'sender_device_id'), senderLibraryEpoch: framedSyncText(row, 'sender_library_epoch'),
    receiverDeviceId: framedSyncText(row, 'receiver_device_id'), receiverLibraryEpoch: framedSyncText(row, 'receiver_library_epoch') };
}

function verifyOriginalPublication(row: DbRow, canonicalHash: Uint8Array) {
  const originalVersion = z.number().int().positive().parse(row.protocol_version);
  const transferId = canonicalTransferIdSync({ ...context(row), protocolVersion: originalVersion }, canonicalHash);
  if (bytesToHex(transferId) !== bytesToHex(framedSyncBytes(row, 'transfer_id'))) {
    throw new Error('parent_order_upgrade_publication_identity_invalid');
  }
}

function retiredParentId(fact: CanonicalFact) {
  if (fact.objectType === 'parent_child_order') return fact.globalId;
  if (!retiredTypes.has(fact.objectType)) return null;
  const payload = fact.body.find((field) => field.name === 'payload_json')?.value;
  if (payload?.kind !== 'string') return null;
  const field = fact.objectType === 'order_version' ? 'parent_id' : 'object_id';
  const value = z.record(z.string(), z.unknown()).parse(JSON.parse(payload.value));
  return z.string().min(1).parse(value[field]);
}

/** Old immutable non-order inputs are republished unchanged, grouped for existing recovery selection. */
export function planParentOrderPublicationUpgrade(row: DbRow, sources: ReadonlyMap<string, readonly ParentOrderSource[]>) {
  const manifest = decodeFramedSyncManifest(framedSyncText(row, 'manifest_json'));
  const canonicalHash = sha256(canonicalManifestBytes(manifest));
  if (bytesToHex(canonicalHash) !== bytesToHex(framedSyncBytes(row, 'content_id'))) {
    throw new Error('parent_order_upgrade_publication_corrupt');
  }
  verifyOriginalPublication(row, canonicalHash);
  const retained = manifest.facts.filter((fact) => !retiredTypes.has(fact.objectType));
  if (!retained.length) return [];
  const groups = new Map<string, CanonicalFact[]>();
  for (const fact of retained) {
    const type = fact.objectType === 'node_reading' ? 'node' : fact.objectType;
    const key = JSON.stringify([type, fact.globalId]);
    groups.set(key, [...(groups.get(key) ?? []), fact]);
  }
  for (const fact of manifest.facts) {
    const parentId = retiredParentId(fact);
    const current = parentId === null ? undefined : sources.get(parentId);
    if (parentId !== null && current) {
      groups.set(JSON.stringify(['parent_child_order', parentId]), [upgradedOrderFact(parentId, current)]);
    }
  }
  return [...groups.values()].map((facts) => {
    const referenced = new Set(facts.flatMap((fact) => fact.blobs.map((blob) => bytesToHex(blob.sha256))));
    const next: CanonicalManifest = { facts, blobs: manifest.blobs.filter((blob) => referenced.has(bytesToHex(blob.sha256))) };
    const contentId = sha256(canonicalManifestBytes(next));
    const binding = context(row);
    const inventory = recoverLegacyPublicationInventory(next);
    return { manifest: next, context: binding, contentId,
      transferId: canonicalTransferIdSync(binding, contentId),
      manifestJson: encodePublicationInventory(next, inventory) };
  });
}

export type ParentOrderUpgradedPublication = ReturnType<typeof planParentOrderPublicationUpgrade>[number];
