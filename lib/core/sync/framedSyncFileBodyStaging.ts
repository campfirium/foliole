import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

import { acceptBlobChunk, isBodyDescriptor, validateBlobOffer, verifyCompleteBlob } from './framedSyncBlobContract.js';
import { pinFramedSyncFileBlob, readFramedSyncFileBlobOffer } from './framedSyncFileBlobRecords.js';
import { hasFramedSyncFileInboundBody, stageFramedSyncFileInboundBody } from './framedSyncFileInboundBodies.js';
import { framedSyncInboundAttemptDirectory, framedSyncInboundDirectory,
  requireFramedSyncFileInbound } from './framedSyncFileInboundRecord.js';
import { encodeFramedSyncFileJson, type FramedSyncFilePort } from './framedSyncFilePort.js';
import type { BlobChunkInput, BlobOfferTransactionInput } from './framedSyncStagingContract.js';

async function offer(files: FramedSyncFilePort, input: BlobOfferTransactionInput) {
  return files.exclusive(framedSyncInboundDirectory(input.transferId), async () => {
    const record = await requireFramedSyncFileInbound(files, input.transferId);
    if (!record.header || record.state !== 'header_declared') throw new Error('inbound_header_required');
    validateBlobOffer(record.header.blobs, input.blobs);
    const attemptId = record.header.attemptId;
    await files.write(`${framedSyncInboundAttemptDirectory(input.transferId, attemptId)}/offers.json`, encodeFramedSyncFileJson(input.blobs));
    const missing: Uint8Array[] = [];
    for (const blob of input.blobs) {
      if (isBodyDescriptor(blob) && await hasFramedSyncFileInboundBody(files, { transferId: input.transferId, attemptId }, blob)) {
        await pinFramedSyncFileBlob(files, input.transferId, attemptId, blob);
      } else missing.push(blob.sha256);
    }
    return missing;
  });
}

function chunkKey(input: BlobChunkInput) {
  return `${framedSyncInboundAttemptDirectory(input.transferId, input.attemptId)}/body-chunks/${bytesToHex(input.sha256)}-${input.offset}.body`;
}

export function createFramedSyncFileBodyStaging(files: FramedSyncFilePort) {
  return {
    commitBlobOfferAndMissingSet: (input: BlobOfferTransactionInput) => offer(files, input),
    async writeBlobChunk(input: BlobChunkInput) {
      return files.exclusive(framedSyncInboundDirectory(input.transferId), async () => {
        const descriptor = await readFramedSyncFileBlobOffer(files, input.transferId, input.attemptId, input.sha256);
        if (!isBodyDescriptor(descriptor)) throw new Error('resource_blob_requires_file_verification');
        const prior = await files.read(chunkKey(input));
        const result = acceptBlobChunk(descriptor, prior ? [{ data: prior, offset: input.offset }] : [], input);
        if (result.result === 'created') await files.write(chunkKey(input), input.data);
        return result.result;
      });
    },
    async verifyAndMarkBlobAvailable(transferId: Uint8Array, attemptId: Uint8Array, hash: Uint8Array) {
      return files.exclusive(framedSyncInboundDirectory(transferId), async () => {
        const descriptor = await readFramedSyncFileBlobOffer(files, transferId, attemptId, hash);
        if (!isBodyDescriptor(descriptor)) throw new Error('resource_blob_requires_file_verification');
        const ready = await hasFramedSyncFileInboundBody(files, { transferId, attemptId }, descriptor);
        if (ready) {
          return pinFramedSyncFileBlob(files, transferId, attemptId, descriptor);
        }
        const data = await files.read(chunkKey({ transferId, attemptId, sha256: hash, offset: 0n, data: new Uint8Array() })) ?? new Uint8Array();
        verifyCompleteBlob(descriptor, data.length ? [{ data, offset: 0n }] : [], sha256(data));
        new TextDecoder('utf-8', { fatal: true }).decode(data);
        await stageFramedSyncFileInboundBody(files, { transferId, attemptId }, descriptor, data);
        return pinFramedSyncFileBlob(files, transferId, attemptId, descriptor);
      });
    }
  };
}
