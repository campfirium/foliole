import { bytesToHex } from '@noble/hashes/utils.js';

import type { CanonicalBlob } from './framedSyncCanonicalManifest.js';
import type { FramedSyncFilePort } from './framedSyncFilePort.js';
import { validateSyncBodyBytes } from './syncBodyBytes.js';

export type FramedSyncBodyOwner = { purpose: 'outbound'; transferId: Uint8Array };

function holdKey(blob: CanonicalBlob, owner: FramedSyncBodyOwner) {
  if (owner.transferId.length !== 32) throw new Error('framed_sync_transfer_id_invalid');
  return `body-holds/${bytesToHex(blob.sha256)}/${owner.purpose}-${bytesToHex(owner.transferId)}`;
}

function bodyKey(blob: CanonicalBlob) {
  if (blob.sha256.byteLength !== 32 || (blob.role !== 1 && blob.role !== 5)) {
    throw new Error('framed_sync_body_descriptor_invalid');
  }
  return `bodies/${bytesToHex(blob.sha256)}.body`;
}

export async function stageFramedSyncFileBody(files: FramedSyncFilePort, blob: CanonicalBlob, data: Uint8Array,
  owner: FramedSyncBodyOwner) {
  validateSyncBodyBytes(blob, data);
  const key = bodyKey(blob);
  await files.exclusive(key, async () => {
    const prior = await files.read(key);
    if (prior) validateSyncBodyBytes(blob, prior);
    await files.write(holdKey(blob, owner), new Uint8Array());
    if (!prior) await files.write(key, data);
  });
}

export async function holdFramedSyncFileBody(files: FramedSyncFilePort, blob: CanonicalBlob,
  owner: FramedSyncBodyOwner) {
  return files.exclusive(bodyKey(blob), async () => {
    const bytes = await files.read(bodyKey(blob));
    if (!bytes) return false;
    validateSyncBodyBytes(blob, bytes);
    await files.write(holdKey(blob, owner), new Uint8Array());
    return true;
  });
}

export async function releaseFramedSyncFileBodies(files: FramedSyncFilePort, blobs: readonly CanonicalBlob[],
  owner: FramedSyncBodyOwner) {
  for (const blob of blobs) {
    if (blob.role !== 1 && blob.role !== 5) continue;
    await files.exclusive(bodyKey(blob), async () => {
      await files.remove(holdKey(blob, owner));
      if (!(await files.list(`body-holds/${bytesToHex(blob.sha256)}`)).length) await files.remove(bodyKey(blob));
    });
  }
}

export async function loadFramedSyncFileBody(files: FramedSyncFilePort, blob: CanonicalBlob) {
  const data = await files.read(bodyKey(blob));
  if (!data) throw new Error('framed_sync_published_body_unavailable');
  return validateSyncBodyBytes(blob, data);
}
