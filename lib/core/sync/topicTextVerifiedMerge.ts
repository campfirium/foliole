import type { DbPort } from './dbPort.js';
import type { VerifiedFramedSyncNode } from './framedSyncVerifiedNode.js';
import { selectChangedTopicMain } from './topicTextConflictMetadata.js';
import { removedTopicTextAttachments } from './topicTextMerge.js';
import { alternativeForBodyHash, normalizeTextAlternativesForHash, textAlternatives } from './topicTextState.js';
import { loadVerifiedBodyRef, type VerifiedBodyRef } from './verifiedBody.js';

export type ReadableVerifiedSyncNode = VerifiedFramedSyncNode & {
  body: Readonly<{ kind: 'readable'; ref: VerifiedBodyRef }>;
};

export function requireReadableVerifiedNode(record: VerifiedFramedSyncNode): ReadableVerifiedSyncNode {
  if (record.body.kind !== 'readable') throw new Error(`sync_node_version_body_unavailable:${record.metadata.version_id}`);
  return { ...record, body: record.body };
}

/** Membership is metadata; the retained alternatives stay verified content references. */
export async function mergeVerifiedTopicTextAttachments(db: DbPort, records: readonly ReadableVerifiedSyncNode[],
  winner: ReadableVerifiedSyncNode, formedAt: string) {
  const removed = await removedTopicTextAttachments(db, records.map((record) => record.metadata));
  const entries = records.flatMap((record) => textAlternatives(record.metadata)).filter((entry) => !removed.has(entry.id));
  for (const record of records) {
    if (record.body.ref.hash === winner.body.ref.hash) continue;
    if (await selectChangedTopicMain(db, record.metadata, winner.metadata) === winner.metadata) continue;
    const entry = alternativeForBodyHash(record.metadata, record.body.ref.hash, formedAt);
    const sourceId = record.metadata.snapshot.text_selection?.version_id;
    if (sourceId && sourceId !== record.metadata.version_id) {
      const [source] = await db.query<{ host_name: string }>(
        'SELECT host_name FROM node_sync_versions WHERE version_id = ?', [sourceId]);
      if (source) entry.source_host_name = source.host_name;
    }
    if (!removed.has(entry.id)) entries.push(entry);
  }
  const alternatives = normalizeTextAlternativesForHash(entries, winner.body.ref.hash, formedAt);
  const bodies: VerifiedBodyRef[] = [];
  for (const entry of alternatives) {
    const ref = await loadVerifiedBodyRef(db, entry.body_blob_hash);
    if (!ref) throw new Error(`text_alternative_body_unavailable:${entry.id}`);
    bodies.push(ref);
  }
  return { alternatives, bodies };
}
