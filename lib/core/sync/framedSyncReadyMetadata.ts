import { bytesToHex } from '@noble/hashes/utils.js';

import { sameFramedSyncBytes } from '../database/framedSyncStagingSerialization.js';

import { canonicalContentId, canonicalContentIdFromSource, type CanonicalFact } from './framedSyncCanonicalManifest.js';
import { FRAMED_SYNC_LIMITS, type PublishedTransfer } from './framedSyncContract.js';
import type { FramedSyncReadySource } from './framedSyncReadySource.js';
import { FRAMED_SYNC_RESOURCE_FACT_KIND, restoreFramedSyncResourceFact } from './framedSyncResourceFact.js';
import type { InboundHeaderDeclarationInput } from './framedSyncStagingContract.js';


type FactDescriptor = Omit<CanonicalFact, 'body'>;
function descriptorKey(fact: FactDescriptor) {
  return JSON.stringify([fact.kind, fact.objectType, fact.globalId, fact.factId,
    bytesToHex(fact.sharedStateHash), fact.blobs.map((blob) => JSON.stringify([
      bytesToHex(blob.sha256), blob.byteLength.toString(), blob.role, blob.required])).sort()]);
}

function headerFactKey(fact: Pick<FactDescriptor, 'kind' | 'objectType' | 'globalId' | 'factId' | 'sharedStateHash'>,
  hashes: readonly Uint8Array[]) {
  return JSON.stringify([fact.kind, fact.objectType, fact.globalId, fact.factId,
    bytesToHex(fact.sharedStateHash), hashes.map(bytesToHex).sort()]);
}

function assertHeaderFacts(source: FramedSyncReadySource, header: InboundHeaderDeclarationInput) {
  if (BigInt(source.entries.length) !== header.proposal.factCount) throw new Error('inbound_manifest_proposal_mismatch');
  const actual = source.entries.map(({ descriptor }) => headerFactKey(descriptor,
    descriptor.blobs.filter((blob) => blob.required).map((blob) => blob.sha256))).sort();
  const expected = header.facts.map((fact) => headerFactKey(fact, fact.requiredBlobHashes)).sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('inbound_manifest_header_mismatch');
}

export async function readFramedSyncReadyMetadata(
  published: Pick<PublishedTransfer, 'context' | 'contentId' | 'manifestHash' | 'transferId'>,
  ready: { context: PublishedTransfer['context']; attemptId: Uint8Array; header: InboundHeaderDeclarationInput },
  storage: { stream(): AsyncIterable<{ sequence: string; fact: CanonicalFact }>; load(sequence: string): Promise<CanonicalFact> }
) {
  const facts: FramedSyncReadySource['entries'][number][] = [];
  for await (const { sequence, fact } of storage.stream()) {
    if (fact.kind === FRAMED_SYNC_RESOURCE_FACT_KIND) restoreFramedSyncResourceFact(fact);
    const descriptor: FactDescriptor = { factId: fact.factId, globalId: fact.globalId, kind: fact.kind,
      objectType: fact.objectType, sharedStateHash: fact.sharedStateHash, blobs: fact.blobs };
    const fingerprint = bytesToHex(await canonicalContentId({ facts: [fact], blobs: fact.blobs }));
    facts.push({ sequence, descriptor, fingerprint });
    if (facts.length > FRAMED_SYNC_LIMITS.maxFactsPerTransfer) throw new Error('canonical_manifest_item_limit_exceeded');
  }
  const first = facts[0]?.descriptor;
  const source: FramedSyncReadySource = { ...published, context: ready.context,
    attemptId: ready.attemptId, blobs: ready.header.blobs, entries: facts, globalId: first?.globalId ?? '', objectType: first?.objectType ?? '' };
  const contentId = await canonicalContentIdFromSource(facts.map((entry) => ({
    locator: entry.sequence, descriptor: entry.descriptor })), source.blobs,
  (sequence) => storage.load(sequence));
  if (!sameFramedSyncBytes(contentId, source.contentId) || !sameFramedSyncBytes(contentId, source.manifestHash)) {
    throw new Error('outbound_manifest_identity_mismatch');
  }
  assertHeaderFacts(source, ready.header);
  const supportedKinds = first?.kind === FRAMED_SYNC_RESOURCE_FACT_KIND ? [FRAMED_SYNC_RESOURCE_FACT_KIND] : [1, 2, 3, 4];
  if (!first || facts.some(({ descriptor }) => descriptor.globalId !== first.globalId ||
      descriptor.objectType !== first.objectType || !supportedKinds.includes(descriptor.kind))) {
    throw new Error('framed_sync_process_fact_set_invalid');
  }
  return source;
}

export async function validateFramedSyncReadyEntry(fact: CanonicalFact,
  entry: FramedSyncReadySource['entries'][number]) {
  if (descriptorKey(fact) !== descriptorKey(entry.descriptor) ||
      bytesToHex(await canonicalContentId({ facts: [fact], blobs: fact.blobs })) !== entry.fingerprint) {
    throw new Error('canonical_fact_source_changed');
  }
  return fact;
}
