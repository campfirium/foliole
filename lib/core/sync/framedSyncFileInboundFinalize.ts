import { bytesToHex } from '@noble/hashes/utils.js';

import { canonicalFramedSyncFactBytes } from './framedSyncCanonicalFactBytes.js';
import { canonicalContentIdFromSource, type CanonicalFact } from './framedSyncCanonicalManifest.js';
import { FRAMED_SYNC_LIMITS } from './framedSyncContract.js';
import { createFramedSyncFileInboundFacts } from './framedSyncFileInboundFacts.js';
import { framedSyncInboundDirectory, requireFramedSyncFileInbound, writeFramedSyncFileInbound } from './framedSyncFileInboundRecord.js';
import type { FramedSyncFilePort } from './framedSyncFilePort.js';
import { readFramedSyncFileFact, streamFramedSyncFileFacts } from './framedSyncFileReadyFacts.js';
import type { InboundFinalizeInput, InboundHeaderDeclarationInput } from './framedSyncStagingContract.js';

function factKey(fact: { kind: number; factId: string; globalId: string; objectType: string }) {
  return JSON.stringify([fact.kind, fact.objectType, fact.globalId, fact.factId]);
}

function assertHeaderFact(fact: CanonicalFact, header: InboundHeaderDeclarationInput) {
  const declared = header.facts.find((entry) => factKey(entry) === factKey(fact));
  const required = fact.blobs.filter((blob) => blob.required).map((blob) => bytesToHex(blob.sha256)).sort();
  if (!declared || bytesToHex(declared.sharedStateHash) !== bytesToHex(fact.sharedStateHash) ||
      JSON.stringify(required) !== JSON.stringify(declared.requiredBlobHashes.map(bytesToHex).sort())) {
    throw new Error('inbound_manifest_header_mismatch');
  }
}

async function verifiedEntries(files: FramedSyncFilePort, input: InboundFinalizeInput, header: InboundHeaderDeclarationInput) {
  const staged = await createFramedSyncFileInboundFacts(files).loadAttemptFacts(input.transferId, input.attemptId);
  const expected = new Map(staged.map((fact) => [factKey({ ...fact, kind: fact.factKind }), fact.canonicalBytes]));
  const entries: { locator: bigint; descriptor: Omit<CanonicalFact, 'body'> }[] = [];
  for await (const { sequence, fact } of streamFramedSyncFileFacts(files, input)) {
    assertHeaderFact(fact, header);
    const bytes = expected.get(factKey(fact));
    if (!bytes || bytesToHex(bytes) !== bytesToHex(canonicalFramedSyncFactBytes(fact))) {
      throw new Error('inbound_attempt_manifest_mismatch');
    }
    entries.push({ locator: sequence, descriptor: { kind: fact.kind, factId: fact.factId, globalId: fact.globalId,
      objectType: fact.objectType, sharedStateHash: fact.sharedStateHash, blobs: fact.blobs } });
    if (entries.length > FRAMED_SYNC_LIMITS.maxFactsPerTransfer) throw new Error('canonical_manifest_item_limit_exceeded');
  }
  if (entries.length !== staged.length || entries.length !== header.facts.length) throw new Error('inbound_facts_incomplete');
  return entries;
}

export async function finalizeFramedSyncFileInbound(files: FramedSyncFilePort, input: InboundFinalizeInput) {
  return files.exclusive(framedSyncInboundDirectory(input.transferId), async () => {
    const record = await requireFramedSyncFileInbound(files, input.transferId, input.attemptId);
    if (!record.header) throw new Error('inbound_header_required');
    if (record.verifiedManifest) {
      if (bytesToHex(record.verifiedManifest) !== bytesToHex(input.manifestHash)) throw new Error('inbound_attempt_manifest_mismatch');
      return 'identical' as const;
    }
    const entries = await verifiedEntries(files, input, record.header);
    const manifestHash = await canonicalContentIdFromSource(entries, record.header.blobs,
      async (sequence) => (await readFramedSyncFileFact(files, input, sequence)).fact);
    if (BigInt(entries.length) !== input.factCount || BigInt(record.header.blobs.length) !== input.blobCount ||
        bytesToHex(manifestHash) !== bytesToHex(input.manifestHash) ||
        bytesToHex(manifestHash) !== bytesToHex(record.proposal.contentId)) throw new Error('inbound_attempt_manifest_mismatch');
    await writeFramedSyncFileInbound(files, { ...record, verifiedManifest: manifestHash, state: 'receiving' });
    return 'created' as const;
  });
}
