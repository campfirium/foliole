import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { z } from 'zod';

import { acceptBlobChunk, isBodyDescriptor } from './framedSyncBlobContract.js';
import { pinFramedSyncFileBlob, readFramedSyncFileBlobOffer } from './framedSyncFileBlobRecords.js';
import { framedSyncInboundAttemptDirectory, framedSyncInboundDirectory } from './framedSyncFileInboundRecord.js';
import { decodeFramedSyncFileJson, encodeFramedSyncFileJson, type FramedSyncFilePort } from './framedSyncFilePort.js';
import { framedFileDigest, framedFileUnsigned } from './framedSyncFileSchemas.js';
import { readFramedSyncNodeResources } from './framedSyncNodeResources.js';
import type { BlobChunkInput } from './framedSyncStagingContract.js';

const chunkSchema = z.object({ offset: framedFileUnsigned, byteLength: framedFileUnsigned, sha256: framedFileDigest });
type ResourceChunk = BlobChunkInput & { chunkSha256: Uint8Array };
type ResourceAvailable = { transferId: Uint8Array; attemptId: Uint8Array; sha256: Uint8Array; storageKey: string };

function directory(input: Pick<ResourceAvailable, 'transferId' | 'attemptId' | 'sha256'>) {
  if (input.sha256.length !== 32) throw new Error('framed_sync_blob_hash_invalid');
  return `${framedSyncInboundAttemptDirectory(input.transferId, input.attemptId)}/resource-chunks/${bytesToHex(input.sha256)}`;
}

async function stage(files: FramedSyncFilePort, input: ResourceChunk) {
  return files.exclusive(framedSyncInboundDirectory(input.transferId), async () => {
    const descriptor = await readFramedSyncFileBlobOffer(files, input.transferId, input.attemptId, input.sha256);
    if (isBodyDescriptor(descriptor)) throw new Error('resource_blob_chunk_invalid');
    acceptBlobChunk(descriptor, [], input);
    if (bytesToHex(sha256(input.data)) !== bytesToHex(input.chunkSha256)) throw new Error('resource_blob_chunk_hash_invalid');
    const value = { offset: input.offset, byteLength: BigInt(input.data.length), sha256: input.chunkSha256 };
    const key = `${directory(input)}/${input.offset}.json`;
    const prior = await files.read(key);
    if (prior) {
      const parsed = chunkSchema.parse(decodeFramedSyncFileJson(prior));
      if (parsed.offset !== value.offset || parsed.byteLength !== value.byteLength ||
          bytesToHex(parsed.sha256) !== bytesToHex(value.sha256)) throw new Error('resource_blob_chunk_overlap');
      return 'identical' as const;
    }
    await files.write(key, encodeFramedSyncFileJson(value));
    return 'created' as const;
  });
}

async function markAvailable(files: FramedSyncFilePort, input: ResourceAvailable) {
  return files.exclusive(framedSyncInboundDirectory(input.transferId), async () => {
    const descriptor = await readFramedSyncFileBlobOffer(files, input.transferId, input.attemptId, input.sha256);
    const resource = readFramedSyncNodeResources(JSON.stringify([{ original_name: null,
      role: descriptor.role === 2 ? 'image' : 'reference', storage_key: input.storageKey }]))[0];
    if (!resource || resource.contentHash !== bytesToHex(input.sha256) || resource.role !== descriptor.role) {
      throw new Error('resource_blob_storage_key_invalid');
    }
    const chunks = [];
    for (const name of await files.list(directory(input))) {
      if (!/^(0|[1-9]\d*)\.json$/u.test(name)) throw new Error('resource_blob_chunk_invalid');
      const data = await files.read(`${directory(input)}/${name}`);
      if (!data) throw new Error('blob_coverage_incomplete');
      chunks.push(chunkSchema.parse(decodeFramedSyncFileJson(data)));
    }
    let offset = 0n;
    for (const chunk of chunks.sort((left, right) => left.offset < right.offset ? -1 : 1)) {
      if (chunk.offset !== offset) throw new Error('blob_coverage_incomplete');
      offset += chunk.byteLength;
    }
    if (offset !== descriptor.byteLength) throw new Error('blob_coverage_incomplete');
    return pinFramedSyncFileBlob(files, input.transferId, input.attemptId, { ...descriptor, storageKey: input.storageKey });
  });
}

export function createFramedSyncFileResourceStaging(files: FramedSyncFilePort) {
  return { stageResourceBlobChunk: (input: ResourceChunk) => stage(files, input),
    verifyAndMarkResourceBlobAvailable: (input: ResourceAvailable) => markAvailable(files, input) };
}
