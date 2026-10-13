import { bytesToHex } from '@noble/hashes/utils.js';

import type { CanonicalBlob } from './framedSyncCanonicalManifest.js';
import { framedSyncInboundAttemptDirectory } from './framedSyncFileInboundRecord.js';
import type { FramedSyncFilePort } from './framedSyncFilePort.js';
import { validateSyncBodyBytes } from './syncBodyBytes.js';

type Owner = Readonly<{ transferId: Uint8Array; attemptId: Uint8Array }>;

function bodyKey(owner: Owner, blob: CanonicalBlob) {
  if (blob.sha256.length !== 32 || (blob.role !== 1 && blob.role !== 5)) throw new Error('framed_sync_body_descriptor_invalid');
  return `${framedSyncInboundAttemptDirectory(owner.transferId, owner.attemptId)}/bodies/${bytesToHex(blob.sha256)}.body`;
}

export async function stageFramedSyncFileInboundBody(files: FramedSyncFilePort, owner: Owner, blob: CanonicalBlob, data: Uint8Array) {
  validateSyncBodyBytes(blob, data);
  await files.write(bodyKey(owner, blob), data);
}

export async function hasFramedSyncFileInboundBody(files: FramedSyncFilePort, owner: Owner, blob: CanonicalBlob) {
  const data = await files.read(bodyKey(owner, blob));
  if (!data) return false;
  validateSyncBodyBytes(blob, data);
  return true;
}

export async function loadFramedSyncFileInboundBody(files: FramedSyncFilePort, owner: Owner, blob: CanonicalBlob) {
  const data = await files.read(bodyKey(owner, blob));
  if (!data) throw new Error('framed_sync_published_body_unavailable');
  return validateSyncBodyBytes(blob, data);
}

/** Validated sources explicitly own the bodies needed by this apply batch. */
export function framedSyncFileInboundBodyLoader(files: FramedSyncFilePort, sources: readonly (Owner & { blobs: readonly CanonicalBlob[] })[]) {
  const owners = new Map<string, Owner>();
  for (const source of sources) for (const blob of source.blobs) owners.set(bytesToHex(blob.sha256), source);
  return async (blob: CanonicalBlob) => {
    const owner = owners.get(bytesToHex(blob.sha256));
    if (!owner) throw new Error('framed_sync_body_owner_missing');
    return loadFramedSyncFileInboundBody(files, owner, blob);
  };
}
