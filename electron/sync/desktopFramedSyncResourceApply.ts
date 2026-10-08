import { bytesToHex } from '@noble/hashes/utils.js';

import { recordFramedSyncPinnedResourceAvailability } from '../../lib/core/database/framedSyncResourceAvailability.js';
import type { DbPort } from '../../lib/core/sync/dbPort.js';
import type { CanonicalFact } from '../../lib/core/sync/framedSyncCanonicalManifest.js';
import { completeFramedSyncResourceDemand } from '../../lib/core/sync/framedSyncResourceDemands.js';
import { FRAMED_SYNC_RESOURCE_FACT_KIND, restoreFramedSyncResourceFact } from '../../lib/core/sync/framedSyncResourceFact.js';
import { createDesktopFramedSyncStaging } from '../database/desktopFramedSyncStaging.js';

import type { DesktopFramedInboundIdentity } from './desktopFramedSyncApplyLifecycle.js';
import { streamDesktopFramedSyncReadySourceFacts, type DesktopFramedSyncReadySource } from './desktopFramedSyncReadySource.js';

export function desktopFramedResourceUnit(facts: readonly CanonicalFact[]) {
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

async function existingResourceReceipt(tx: DbPort, transfer: DesktopFramedInboundIdentity) {
  const staging = createDesktopFramedSyncStaging(tx);
  const prior = await staging.loadReceipt(transfer.transferId);
  if (prior) {
    if (bytesToHex(prior.contentId) !== bytesToHex(transfer.manifestHash) ||
        bytesToHex(prior.appliedStateHash) !== bytesToHex(transfer.manifestHash) ||
        prior.receiverDeviceId !== transfer.context.receiverDeviceId ||
        prior.receiverLibraryEpoch !== transfer.context.receiverLibraryEpoch) {
      throw new Error('framed_sync_resource_receipt_mismatch');
    }
  }
  return prior;
}

/** Replay does not require retired ready frames; the durable receipt preserves the resource result. */
export async function commitDesktopFramedResourceSourceInbound(tx: DbPort, source: DesktopFramedSyncReadySource) {
  if (!source.entries.length || source.entries.some(({ descriptor }) => descriptor.kind !== FRAMED_SYNC_RESOURCE_FACT_KIND)) {
    throw new Error('framed_sync_resource_unit_required');
  }
  const prior = await existingResourceReceipt(tx, source);
  if (prior) return prior;
  const facts: CanonicalFact[] = [];
  for await (const { fact } of streamDesktopFramedSyncReadySourceFacts(tx, source)) facts.push(fact);
  return commitDesktopFramedResourceInbound(tx, { ...source, facts });
}

/** The caller's business transaction owns exact-set validation and the independent receipt. */
export async function commitDesktopFramedResourceInbound(tx: DbPort,
  transfer: DesktopFramedInboundIdentity & { facts: readonly CanonicalFact[] }) {
  const resources = desktopFramedResourceUnit(transfer.facts);
  if (!resources) throw new Error('framed_sync_resource_unit_required');
  const prior = await existingResourceReceipt(tx, transfer);
  if (prior) return prior;
  const staging = createDesktopFramedSyncStaging(tx);
  const pins = await tx.query<{ hash: string; byte_length: number; role: number; required: number;
    storage_key: string; available_length: number; available_key: string }>(
    `SELECT lower(hex(pin.sha256)) AS hash, pin.byte_length, pin.role, pin.required, pin.storage_key,
      available.byte_length AS available_length, available.storage_key AS available_key
      FROM framed_sync_resource_pins pin JOIN framed_sync_available_resources available ON available.sha256 = pin.sha256
      WHERE pin.transfer_id = ?`, [transfer.transferId]);
  const byHash = new Map(pins.map((pin) => [pin.hash, pin]));
  if (pins.length !== resources.length || byHash.size !== resources.length || resources.some((entry) => {
    const pin = byHash.get(entry.resource.contentHash);
    return !pin || BigInt(pin.byte_length) !== entry.blob.byteLength || pin.role !== entry.blob.role ||
      pin.required !== 1 || pin.storage_key !== entry.resource.storageKey ||
      BigInt(pin.available_length) !== entry.blob.byteLength || pin.available_key !== entry.resource.storageKey;
  })) throw new Error('framed_sync_resource_pin_set_mismatch');
  const [bodyPin] = await tx.query('SELECT 1 FROM framed_sync_blob_pins WHERE transfer_id = ? LIMIT 1', [transfer.transferId]);
  if (bodyPin) throw new Error('framed_sync_resource_pin_set_mismatch');
  await recordFramedSyncPinnedResourceAvailability(tx, [transfer.transferId]);
  const receipt = await staging.commitApplyAndReceipt({ appliedStateHash: transfer.manifestHash, contentId: transfer.manifestHash,
    receiverDeviceId: transfer.context.receiverDeviceId, receiverLibraryEpoch: transfer.context.receiverLibraryEpoch,
    transferId: transfer.transferId });
  for (const fact of transfer.facts) {
    await completeFramedSyncResourceDemand(tx, transfer.context, fact, transfer.transferId);
  }
  return receipt;
}
