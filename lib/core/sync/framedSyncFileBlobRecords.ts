import { bytesToHex } from '@noble/hashes/utils.js';
import { z } from 'zod';

import type { ManifestBlobDescriptor } from './framedSyncBlobContract.js';
import { framedSyncInboundAttemptDirectory, requireFramedSyncFileInbound } from './framedSyncFileInboundRecord.js';
import { decodeFramedSyncFileJson, encodeFramedSyncFileJson, type FramedSyncFilePort } from './framedSyncFilePort.js';
import { framedFileBlob } from './framedSyncFileSchemas.js';

const pinSchema = framedFileBlob.extend({ storageKey: z.string().optional() });
export type FramedSyncFilePin = z.infer<typeof pinSchema>;

export async function readFramedSyncFileBlobOffer(files: FramedSyncFilePort, transferId: Uint8Array,
  attemptId: Uint8Array, hash: Uint8Array) {
  const record = await requireFramedSyncFileInbound(files, transferId, attemptId);
  const data = await files.read(`${framedSyncInboundAttemptDirectory(transferId, attemptId)}/offers.json`);
  if (!data || record.state === 'proposed' || record.state === 'applied') throw new Error('blob_offer_required');
  const offers = z.array(framedFileBlob).parse(decodeFramedSyncFileJson(data));
  const descriptor = offers.find((blob) => bytesToHex(blob.sha256) === bytesToHex(hash));
  if (!descriptor) throw new Error('blob_offer_required');
  return descriptor;
}

export function framedSyncFilePinKey(transferId: Uint8Array, attemptId: Uint8Array, hash: Uint8Array) {
  if (hash.byteLength !== 32) throw new Error('framed_sync_blob_hash_invalid');
  return `${framedSyncInboundAttemptDirectory(transferId, attemptId)}/pins/${bytesToHex(hash)}.json`;
}

export async function loadFramedSyncFilePins(files: FramedSyncFilePort, transferId: Uint8Array) {
  const record = await requireFramedSyncFileInbound(files, transferId);
  if (!record.header) return [];
  const pins: FramedSyncFilePin[] = [];
  for (const blob of record.header.blobs) {
    const data = await files.read(framedSyncFilePinKey(transferId, record.header.attemptId, blob.sha256));
    if (!data) continue;
    const pin = pinSchema.parse(decodeFramedSyncFileJson(data));
    if (!sameDescriptor(pin, blob)) throw new Error('blob_pin_identity_conflict');
    pins.push(pin);
  }
  return pins;
}

export async function pinFramedSyncFileBlob(files: FramedSyncFilePort, transferId: Uint8Array,
  attemptId: Uint8Array, descriptor: FramedSyncFilePin) {
  const key = framedSyncFilePinKey(transferId, attemptId, descriptor.sha256);
  const prior = await files.read(key);
  if (prior) {
    const parsed = pinSchema.parse(decodeFramedSyncFileJson(prior));
    if (!sameDescriptor(parsed, descriptor) || parsed.storageKey !== descriptor.storageKey) throw new Error('blob_pin_identity_conflict');
    return 'identical' as const;
  }
  await files.write(key, encodeFramedSyncFileJson(descriptor));
  return 'available' as const;
}

function sameDescriptor(left: ManifestBlobDescriptor, right: ManifestBlobDescriptor) {
  return bytesToHex(left.sha256) === bytesToHex(right.sha256) && left.byteLength === right.byteLength &&
    left.role === right.role && left.required === right.required;
}
