import { bytesToHex } from '@noble/hashes/utils.js';

import { recordFramedSyncResourceAvailability } from '../database/framedSyncResourceAvailability.js';

import type { DbPort } from './dbPort.js';
import { loadFramedSyncFilePins } from './framedSyncFileBlobRecords.js';
import type { FramedSyncFilePort } from './framedSyncFilePort.js';
import { streamFramedSyncFileReadySourceFacts } from './framedSyncFileReadySource.js';
import { validateFramedSyncFileResourceDemand } from './framedSyncFileResourceDemands.js';
import type { FramedSyncReadySource } from './framedSyncReadySource.js';
import { framedSyncResourceUnit } from './framedSyncResourceFact.js';

export async function recordFramedSyncFileResources(tx: DbPort, files: FramedSyncFilePort,
  transferIds: readonly Uint8Array[]) {
  for (const id of transferIds) {
    const pins = await loadFramedSyncFilePins(files, id);
    await recordFramedSyncResourceAvailability(tx,
      pins.filter((pin) => [2, 3, 4].includes(pin.role)).map((pin) => bytesToHex(pin.sha256)), true);
  }
}

export async function applyFramedSyncFileResourceSource(tx: DbPort, files: FramedSyncFilePort,
  source: FramedSyncReadySource) {
  const facts = [];
  for await (const { fact } of streamFramedSyncFileReadySourceFacts(files, source)) facts.push(fact);
  const resources = framedSyncResourceUnit(facts);
  if (!resources) throw new Error('framed_sync_resource_unit_required');
  const pins = await loadFramedSyncFilePins(files, source.transferId);
  const byHash = new Map(pins.map((pin) => [bytesToHex(pin.sha256), pin]));
  if (pins.length !== resources.length || byHash.size !== resources.length || resources.some((entry) => {
    const pin = byHash.get(entry.resource.contentHash);
    return !pin || pin.byteLength !== entry.blob.byteLength || pin.role !== entry.blob.role ||
      !pin.required || pin.storageKey !== entry.resource.storageKey;
  })) throw new Error('framed_sync_resource_pin_set_mismatch');
  for (const fact of facts) await validateFramedSyncFileResourceDemand(files, source.context, fact, source.transferId);
  await recordFramedSyncFileResources(tx, files, [source.transferId]);
  return facts;
}
