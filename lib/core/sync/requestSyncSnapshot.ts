import type { DbPort } from './dbPort.js';
import { loadFramedExternalDocumentBody } from './framedSyncExternalDocumentBody.js';
import { revalidateFramedSyncInventorySource, requiredFramedSyncNodeVersionIds,
  type FramedSyncInventoryDifference } from './framedSyncInventory.js';
import { readFramedSyncInventoryEntry } from './framedSyncInventoryRead.js';
import { selectFramedSyncNodeChildFact } from './framedSyncNodeChildFact.js';
import { projectFramedSyncNodeIdentityFact, projectFramedSyncNodeRecord } from './framedSyncNodeProjection.js';
import { selectFramedSyncObjectStateFact } from './framedSyncObjectStateFact.js';
import { selectFramedSyncRelationReviewFactsWithDbPort } from './framedSyncRelationReviewSelection.js';
import type { RequestSyncFiles } from './requestSyncFiles.js';
import { selectRequestSyncNodeSource } from './requestSyncSelection.js';
import { assertSyncGroupLocalPublicationAllowed } from './syncGroupLocalAdoption.js';
import { loadRetainedSyncNodeVersionFact } from './syncNodeGraph.js';
import { isNodeVersionIdentityOnly } from './syncNodeVersionHistory.js';

async function writeNodes(db: DbPort, difference: FramedSyncInventoryDifference, files: RequestSyncFiles) {
  const requested = requiredFramedSyncNodeVersionIds(difference);
  for (const id of requested) {
    const record = await loadRetainedSyncNodeVersionFact(db, id, false);
    if (!record || record.object_id !== difference.globalId) throw new Error(`request_sync_version_missing:${id}`);
    if (isNodeVersionIdentityOnly(record)) {
      await files.writeFact(projectFramedSyncNodeIdentityFact(record));
      continue;
    }
    const projection = projectFramedSyncNodeRecord(record);
    const fact = projection.manifest.facts[0];
    const body = fact?.blobs.find(blob => blob.role === 1);
    if (!fact || !body) throw new Error('request_sync_body_descriptor_missing');
    await files.writeBody(body, projection.bodyBlob);
    for (const alternative of projection.alternativeBodyBlobs ?? []) await files.writeBody(alternative.blob, alternative.data);
    await files.writeFact(fact);
  }
  const related = await selectFramedSyncRelationReviewFactsWithDbPort(db, difference);
  if (related.kind === 'deferred') throw new Error('framed_sync_source_changed');
  for (const fact of related.facts) await files.writeFact(fact);
  for (const id of difference.need.stateFactIds ?? []) {
    await files.writeFact(await selectFramedSyncNodeChildFact(db, difference.globalId, id));
  }
}

/** Called only inside the host's independent read snapshot, never across network I/O. */
export async function writeRequestSyncSnapshot(db: DbPort, difference: FramedSyncInventoryDifference,
  files: RequestSyncFiles) {
  if (difference.direction !== 'local_to_remote') throw new Error('request_sync_direction_invalid');
  await assertSyncGroupLocalPublicationAllowed(db);
  const entry = await readFramedSyncInventoryEntry(db, difference);
  if (!entry) throw new Error('framed_sync_source_changed');
  if (difference.objectType === 'node') {
    const selected = await selectRequestSyncNodeSource(db, entry, difference);
    await writeNodes(db, { ...difference, sourceSnapshot: selected }, files);
    return selected;
  }
  const validation = revalidateFramedSyncInventorySource({ currentSource: [entry],
    differences: [difference], direction: 'local_to_remote' });
  if (validation.deferredObjects.length || !entry) throw new Error('framed_sync_source_changed');
  for (const id of difference.need.stateFactIds?.length ? difference.need.stateFactIds : entry.stateFactIds ?? []) {
    const fact = await selectFramedSyncObjectStateFact(db, difference, id);
    for (const blob of fact.blobs) {
      if (blob.role !== 5) throw new Error('request_sync_body_role_invalid');
      await files.writeBody(blob, await loadFramedExternalDocumentBody(db, fact.globalId, blob));
    }
    await files.writeFact(fact);
  }
  return entry;
}
