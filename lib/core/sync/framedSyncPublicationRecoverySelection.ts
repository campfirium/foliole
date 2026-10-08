import { readFramedSyncPublication, readFramedSyncRow } from '../database/framedSyncStagingSerialization.js';

import type { DbPort } from './dbPort.js';
import { canonicalContentId, canonicalTransferId, type CanonicalManifest } from './framedSyncCanonicalManifest.js';
import { retireFramedSyncFrozenBodies } from './framedSyncFrozenBody.js';
import { requiredFramedSyncNodeVersionIds, type FramedSyncInventoryDifference,
  type FramedSyncInventoryEntry } from './framedSyncInventory.js';
import { recoverLegacyPublicationInventory } from './framedSyncLegacyPublicationInventory.js';
import { publishFramedSyncOutboundWithDbPort } from './framedSyncOutboundStaging.js';
import { recheckPublicationInventory } from './framedSyncPublicationInventory.js';
import { FRAMED_SYNC_RESOURCE_FACT_KIND, restoreFramedSyncResourceFact } from './framedSyncResourceFact.js';
import type { OutboundPublishInput } from './framedSyncStagingContract.js';

export function selectFramedSyncRecoveryManifest(publication: OutboundPublishInput,
  difference: FramedSyncInventoryDifference): CanonicalManifest {
  const versions = difference.objectType === 'node' ? requiredFramedSyncNodeVersionIds(difference) : [];
  const selected = new Set([...versions, ...difference.need.requiredRelationIds,
    ...difference.need.reviewFactIds, ...(difference.need.stateFactIds ?? [])]);
  const requiredResources = new Set(difference.need.resourceHashes.map(key));
  const facts = publication.manifest.facts.filter((fact) => {
    if (fact.objectType !== difference.objectType || fact.globalId !== difference.globalId) return false;
    if (fact.kind === FRAMED_SYNC_RESOURCE_FACT_KIND) {
      return requiredResources.has(key(restoreFramedSyncResourceFact(fact).blob.sha256));
    }
    return (difference.objectType === 'external_document' && fact.kind === 1 &&
      fact.blobs.some((blob) => blob.role === 5 && requiredResources.has(key(blob.sha256)))) ||
      selected.has(fact.factId) ||
      (difference.objectType !== 'node' && difference.need.sharedState && fact.kind === 1);
  });
  if (!facts.length) throw new Error('framed_sync_recovery_fact_unavailable');
  const hashes = new Set(facts.flatMap((fact) => fact.blobs.map((blob) => key(blob.sha256))));
  const blobs = publication.manifest.blobs.filter((blob) => hashes.has(key(blob.sha256)));
  return { blobs, facts };
}

/** Keeps the original owner until the missing subset has a matching durable result. */
export function selectFramedSyncRecoveryPublication(db: DbPort, transferId: Uint8Array,
  remote: readonly FramedSyncInventoryEntry[]) {
  return db.transaction(async (tx) => {
    const row = await readFramedSyncRow(tx,
      'SELECT * FROM framed_sync_outbound_publications WHERE transfer_id = ?', [transferId]);
    if (!row) throw new Error('framed_sync_outbound_publication_missing');
    const publication = readFramedSyncPublication(row);
    const original = publication.inventoryDifference ?? recoverLegacyPublicationInventory(publication.manifest);
    const inventoryDifference = recheckPublicationInventory(original, remote);
    if (!inventoryDifference) throw new Error('framed_sync_recovery_already_satisfied');
    const manifest = selectFramedSyncRecoveryManifest(publication, inventoryDifference);
    const contentId = await canonicalContentId(manifest);
    const recovery = { ...publication, manifest, inventoryDifference, contentId, manifestHash: contentId,
      transferId: await canonicalTransferId(publication.context, contentId) };
    await publishFramedSyncOutboundWithDbPort(tx, recovery);
    await tx.run(`DELETE FROM framed_sync_outbound_attempts
      WHERE transfer_id = ? AND purpose = 'transfer'`, [recovery.transferId]);
    return recovery;
  });
}

export function completeFramedSyncRecoveredPublication(db: DbPort, originalId: Uint8Array,
  deliveredId: Uint8Array) {
  return db.transaction(async (tx) => {
    const delivered = await readFramedSyncRow(tx,
      `SELECT state FROM framed_sync_outbound_publications WHERE transfer_id = ?`, [deliveredId]);
    if (delivered?.state !== 'receipt_committed') throw new Error('framed_sync_recovery_delivery_unconfirmed');
    await tx.run(`UPDATE framed_sync_outbound_publications SET state = 'receipt_committed'
      WHERE transfer_id = ? AND state = 'published'`, [originalId]);
    await tx.run('DELETE FROM framed_sync_outbound_holds WHERE transfer_id = ?', [originalId]);
    await retireFramedSyncFrozenBodies(tx, originalId);
  });
}

const key = (hash: Uint8Array) => Array.from(hash).join(',');
