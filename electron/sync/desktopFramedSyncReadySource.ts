import { framedSyncBigInt, framedSyncBytes, readFramedSyncContext, readFramedSyncHeader, readFramedSyncRow,
  sameFramedSyncBytes } from '../../lib/core/database/framedSyncStagingSerialization.js';
import type { DbPort } from '../../lib/core/sync/dbPort.js';
import { canonicalTransferId, type CanonicalFact } from '../../lib/core/sync/framedSyncCanonicalManifest.js';
import { type PublishedTransfer } from '../../lib/core/sync/framedSyncContract.js';
import { readFramedSyncFactFrame } from '../../lib/core/sync/framedSyncFactFrameReader.js';
import { streamFramedSyncReadyFactFrames } from '../../lib/core/sync/framedSyncReadyFactFrames.js';
import { readFramedSyncReadyMetadata as readDesktopFramedSyncReadyMetadata,
  validateFramedSyncReadyEntry as validateDesktopFramedSyncReadyEntry } from '../../lib/core/sync/framedSyncReadyMetadata.js';
import type { FramedSyncReadySource as DesktopFramedSyncReadySource } from '../../lib/core/sync/framedSyncReadySource.js';
import { assertInboundHeaderMatchesProposal,
  type InboundHeaderDeclarationInput } from '../../lib/core/sync/framedSyncStagingContract.js';
import { canonicalFactFromValidatedMessage } from '../../lib/core/sync/framedSyncWireFact.js';


type ReadyPublication = Pick<PublishedTransfer, 'context' | 'contentId' | 'manifestHash' | 'transferId'>;
export type { FramedSyncReadySource as DesktopFramedSyncReadySource } from '../../lib/core/sync/framedSyncReadySource.js';

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
  return readDesktopFramedSyncReadyMetadata(published, ready, {
    stream: () => streamFramedSyncReadyFactFrames(db, published.transferId, ready.attemptId, 'desktop'),
    async load(sequence) {
      const decoded = await readFramedSyncFactFrame(db, published.transferId, ready.attemptId, sequence, 'desktop');
      return canonicalFactFromValidatedMessage(decoded.message);
    }
  });
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
  return validateDesktopFramedSyncReadyEntry(fact, entry);
}

export async function* streamDesktopFramedSyncReadySourceFacts(db: DbPort, source: DesktopFramedSyncReadySource) {
  for (const entry of source.entries) yield { sequence: entry.sequence,
    fact: await loadReadySourceEntry(db, source, entry) };
}
