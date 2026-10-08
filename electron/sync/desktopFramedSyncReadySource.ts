import { bytesToHex } from '@noble/hashes/utils.js';

import { framedSyncBigInt, framedSyncBytes, readFramedSyncContext, readFramedSyncHeader, readFramedSyncRow,
  sameFramedSyncBytes } from '../../lib/core/database/framedSyncStagingSerialization.js';
import type { DbPort } from '../../lib/core/sync/dbPort.js';
import { canonicalContentId, canonicalContentIdFromSource, canonicalTransferId,
  type CanonicalFact } from '../../lib/core/sync/framedSyncCanonicalManifest.js';
import { FRAMED_SYNC_LIMITS,
  type PublishedTransfer } from '../../lib/core/sync/framedSyncContract.js';
import { readFramedSyncFactFrame } from '../../lib/core/sync/framedSyncFactFrameReader.js';
import { streamFramedSyncReadyFactFrames } from '../../lib/core/sync/framedSyncReadyFactFrames.js';
import { FRAMED_SYNC_RESOURCE_FACT_KIND, restoreFramedSyncResourceFact } from '../../lib/core/sync/framedSyncResourceFact.js';
import { assertInboundHeaderMatchesProposal,
  type InboundHeaderDeclarationInput } from '../../lib/core/sync/framedSyncStagingContract.js';
import { canonicalFactFromValidatedMessage } from '../../lib/core/sync/framedSyncWireFact.js';

type ReadyPublication = Pick<PublishedTransfer, 'context' | 'contentId' | 'manifestHash' | 'transferId'>;
type FactDescriptor = Omit<CanonicalFact, 'body'>;
export type DesktopFramedSyncReadySource = ReadyPublication & Readonly<{
  attemptId: Uint8Array;
  blobs: InboundHeaderDeclarationInput['blobs'];
  entries: readonly Readonly<{ sequence: string; descriptor: FactDescriptor; fingerprint: string }>[];
  globalId: string;
  objectType: string;
}>;

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

function assertHeaderFacts(source: DesktopFramedSyncReadySource, header: InboundHeaderDeclarationInput) {
  if (BigInt(source.entries.length) !== header.proposal.factCount) throw new Error('inbound_manifest_proposal_mismatch');
  const actual = source.entries.map(({ descriptor }) => headerFactKey(descriptor,
    descriptor.blobs.filter((blob) => blob.required).map((blob) => blob.sha256))).sort();
  const expected = header.facts.map((fact) => headerFactKey(fact, fact.requiredBlobHashes)).sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('inbound_manifest_header_mismatch');
}

async function readyHeader(db: DbPort, published: ReadyPublication) {
  const row = await readFramedSyncRow(db, `SELECT * FROM framed_sync_inbound_transfers
    WHERE transfer_id = ? AND state = 'ready_to_apply'`, [published.transferId]);
  if (!row) return null;
  const context = readFramedSyncContext(row);
  if (row.protocol_version !== published.context.protocolVersion ||
      Object.entries(context).some(([key, value]) => published.context[key as keyof typeof context] !== value)) {
    throw new Error('framed_sync_transfer_context_mismatch');
  }
  const header = readFramedSyncHeader(row);
  assertInboundHeaderMatchesProposal(header);
  if (!sameFramedSyncBytes(header.published.manifestHash, published.manifestHash) ||
      !sameFramedSyncBytes(header.published.contentId, published.contentId)) throw new Error('framed_sync_ready_manifest_mismatch');
  if (!sameFramedSyncBytes(await canonicalTransferId(context, published.contentId), published.transferId)) {
    throw new Error('inbound_transfer_identity_mismatch');
  }
  await assertReadyBodyPins(db, published.transferId, header.blobs);
  return { header, context, attemptId: framedSyncBytes(row, 'active_attempt_id') };
}

async function assertReadyBodyPins(db: DbPort, transferId: Uint8Array,
  blobs: InboundHeaderDeclarationInput['blobs']) {
  for (const blob of blobs) {
    if (blob.role !== 1 && blob.role !== 5) continue;
    const row = await readFramedSyncRow(db, `SELECT pin.byte_length, pin.role, pin.required,
      available.byte_length AS available_length, length(available.data) AS stored_length,
      typeof(available.data) AS stored_type FROM framed_sync_blob_pins pin
      JOIN framed_sync_available_blobs available ON available.sha256 = pin.sha256
      WHERE pin.transfer_id = ? AND pin.sha256 = ?`, [transferId, blob.sha256]);
    if (!row || framedSyncBigInt(row, 'byte_length') !== blob.byteLength || row.role !== blob.role ||
        row.required !== Number(blob.required) || framedSyncBigInt(row, 'available_length') !== blob.byteLength ||
        framedSyncBigInt(row, 'stored_length') !== blob.byteLength || row.stored_type !== 'blob') {
      throw new Error('framed_sync_body_pin_mismatch');
    }
  }
}

/** Keeps descriptors and fixed staging locators; decoded payloads live for one fact only. */
export async function loadDesktopFramedSyncReadySource(db: DbPort, published: ReadyPublication) {
  const ready = await readyHeader(db, published);
  if (!ready) return null;
  const facts: DesktopFramedSyncReadySource['entries'][number][] = [];
  for await (const { sequence, fact } of streamFramedSyncReadyFactFrames(db, published.transferId, ready.attemptId, 'desktop')) {
    if (fact.kind === FRAMED_SYNC_RESOURCE_FACT_KIND) restoreFramedSyncResourceFact(fact);
    const descriptor: FactDescriptor = { factId: fact.factId, globalId: fact.globalId, kind: fact.kind,
      objectType: fact.objectType, sharedStateHash: fact.sharedStateHash, blobs: fact.blobs };
    const fingerprint = bytesToHex(await canonicalContentId({ facts: [fact], blobs: fact.blobs }));
    facts.push({ sequence, descriptor, fingerprint });
    if (facts.length > FRAMED_SYNC_LIMITS.maxFactsPerTransfer) throw new Error('canonical_manifest_item_limit_exceeded');
  }
  const first = facts[0]?.descriptor;
  const source: DesktopFramedSyncReadySource = { ...published, context: ready.context,
    attemptId: ready.attemptId, blobs: ready.header.blobs, entries: facts, globalId: first?.globalId ?? '', objectType: first?.objectType ?? '' };
  const contentId = await canonicalContentIdFromSource(facts.map((entry) => ({
    locator: entry.sequence, descriptor: entry.descriptor })), source.blobs,
  (sequence) => loadDesktopFramedSyncReadySourceFact(db, source, sequence));
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

export async function loadDesktopFramedSyncReadySourceFact(db: DbPort, source: DesktopFramedSyncReadySource,
  sequence: string): Promise<CanonicalFact> {
  const entry = source.entries.find((fact) => fact.sequence === sequence);
  if (!entry) throw new Error('canonical_fact_source_changed');
  return loadReadySourceEntry(db, source, entry);
}

async function loadReadySourceEntry(db: DbPort, source: DesktopFramedSyncReadySource,
  entry: DesktopFramedSyncReadySource['entries'][number]): Promise<CanonicalFact> {
  const decoded = await readFramedSyncFactFrame(db, source.transferId, source.attemptId, entry.sequence, 'desktop');
  const fact = canonicalFactFromValidatedMessage(decoded.message);
  if (descriptorKey(fact) !== descriptorKey(entry.descriptor) ||
      bytesToHex(await canonicalContentId({ facts: [fact], blobs: fact.blobs })) !== entry.fingerprint) {
    throw new Error('canonical_fact_source_changed');
  }
  return fact;
}

export async function* streamDesktopFramedSyncReadySourceFacts(db: DbPort, source: DesktopFramedSyncReadySource) {
  for (const entry of source.entries) yield { sequence: entry.sequence,
    fact: await loadReadySourceEntry(db, source, entry) };
}
