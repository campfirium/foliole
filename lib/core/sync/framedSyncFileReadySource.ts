import { bytesToHex } from '@noble/hashes/utils.js';

import type { PublishedTransfer } from './framedSyncContract.js';
import { loadFramedSyncFilePins } from './framedSyncFileBlobRecords.js';
import { loadFramedSyncFileInboundBody } from './framedSyncFileInboundBodies.js';
import { readFramedSyncFileInbound } from './framedSyncFileInboundRecord.js';
import type { FramedSyncFilePort } from './framedSyncFilePort.js';
import { readFramedSyncFileFact, streamFramedSyncFileFacts } from './framedSyncFileReadyFacts.js';
import { readFramedSyncReadyMetadata, validateFramedSyncReadyEntry } from './framedSyncReadyMetadata.js';
import type { FramedSyncReadySource } from './framedSyncReadySource.js';
import { sameFramedSyncContext } from './framedSyncStagingContract.js';

export async function loadFramedSyncFileReadySource(files: FramedSyncFilePort,
  published: Pick<PublishedTransfer, 'context' | 'contentId' | 'manifestHash' | 'transferId'>) {
  const record = await readFramedSyncFileInbound(files, published.transferId);
  if (!record || record.state !== 'ready_to_apply') return null;
  if (!record.header || !record.verifiedManifest || !sameFramedSyncContext(record.proposal.context, published.context) ||
      bytesToHex(record.proposal.contentId) !== bytesToHex(published.contentId) ||
      bytesToHex(record.verifiedManifest) !== bytesToHex(published.manifestHash)) {
    throw new Error('framed_sync_ready_manifest_mismatch');
  }
  const pins = await loadFramedSyncFilePins(files, published.transferId);
  for (const blob of record.header.blobs) {
    if (blob.role !== 1 && blob.role !== 5) continue;
    if (!pins.some((pin) => bytesToHex(pin.sha256) === bytesToHex(blob.sha256))) {
      throw new Error('framed_sync_body_pin_mismatch');
    }
    await loadFramedSyncFileInboundBody(files, { transferId: published.transferId, attemptId: record.header.attemptId }, blob);
  }
  const identity = { transferId: published.transferId, attemptId: record.header.attemptId };
  return readFramedSyncReadyMetadata(published, { header: record.header,
    context: record.proposal.context, attemptId: record.header.attemptId }, {
    async *stream() {
      for await (const entry of streamFramedSyncFileFacts(files, identity)) {
        yield { ...entry, sequence: entry.sequence.toString() };
      }
    },
    async load(sequence) { return (await readFramedSyncFileFact(files, identity, BigInt(sequence))).fact; }
  });
}

export async function* streamFramedSyncFileReadySourceFacts(files: FramedSyncFilePort,
  source: FramedSyncReadySource) {
  for (const entry of source.entries) {
    const { fact } = await readFramedSyncFileFact(files, source, BigInt(entry.sequence));
    yield { sequence: entry.sequence, fact: await validateFramedSyncReadyEntry(fact, entry) };
  }
}
