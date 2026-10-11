import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';

import { loadFramedSyncFilePins } from './framedSyncFileBlobRecords.js';
import { readFramedSyncFileInbound } from './framedSyncFileInboundRecord.js';
import { encodeFramedSyncFileJson, type FramedSyncFilePort } from './framedSyncFilePort.js';
import { streamFramedSyncFilePublications } from './framedSyncFilePublication.js';
import { framedSyncPublicationResources } from './framedSyncPublicationResources.js';

export async function readFramedSyncFileResourceReferences(files: FramedSyncFilePort) {
  const keys = new Set<string>();
  for await (const publication of streamFramedSyncFilePublications(files)) {
    for (const resource of framedSyncPublicationResources(publication.manifest).values()) keys.add(resource.storageKey);
  }
  for (const id of await files.list('inbound')) {
    if (!/^[a-f0-9]{64}$/u.test(id)) throw new Error('inbound_transfer_identity_mismatch');
    const transferId = hexToBytes(id);
    if (!await readFramedSyncFileInbound(files, transferId)) continue;
    for (const pin of await loadFramedSyncFilePins(files, transferId)) if (pin.storageKey) keys.add(pin.storageKey);
  }
  const storageKeys = [...keys].sort();
  return { storageKeys, revision: bytesToHex(sha256(encodeFramedSyncFileJson(storageKeys))) };
}
