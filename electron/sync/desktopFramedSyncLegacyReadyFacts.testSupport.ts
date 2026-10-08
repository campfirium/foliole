import { framedSyncBytes, readFramedSyncContext, readFramedSyncHeader, readFramedSyncRow,
  sameFramedSyncBytes } from '../../lib/core/database/framedSyncStagingSerialization.js';
import type { DbPort } from '../../lib/core/sync/dbPort.js';
import { canonicalTransferId } from '../../lib/core/sync/framedSyncCanonicalManifest.js';
import type { PublishedTransfer } from '../../lib/core/sync/framedSyncContract.js';
import { readFramedSyncReadyFactFrames } from '../../lib/core/sync/framedSyncReadyFactFrames.js';
import { assertInboundHeaderMatchesProposal, assertInboundManifestMatchesProposal } from '../../lib/core/sync/framedSyncStagingContract.js';

import { desktopFramedResourceUnit } from './desktopFramedSyncResourceApply.js';

type ReadyPublication = Pick<PublishedTransfer, 'context' | 'contentId' | 'manifestHash' | 'transferId'>;

/** Test oracle for the former aggregate loader; production uses the fixed ready source. */
export async function loadLegacyDesktopFramedSyncReadyFacts(db: DbPort, published: ReadyPublication) {
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
  const facts = await readFramedSyncReadyFactFrames(db, published.transferId, framedSyncBytes(row, 'active_attempt_id'), 'desktop');
  const manifest = { facts, blobs: header.blobs };
  await assertInboundManifestMatchesProposal({ attemptId: header.attemptId, header, proposal: header.proposal,
    publication: { ...header.published, manifest }, reservationId: header.reservationId });
  const first = facts[0];
  const resources = desktopFramedResourceUnit(facts);
  if (!first || facts.some((fact) => fact.globalId !== first.globalId || fact.objectType !== first.objectType ||
    (!resources && ![1, 2, 3, 4].includes(fact.kind)))) throw new Error('framed_sync_process_fact_set_invalid');
  return { facts, blobs: header.blobs, context, contentId: published.contentId,
    manifestHash: published.manifestHash, transferId: published.transferId,
    globalId: first.globalId, objectType: first.objectType };
}
