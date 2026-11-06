import type { NativeSyncNodeRecord } from '../../platform/nativeSyncContract.js';
import { parseImageSources, serializeImageSources } from '../database/imageSources.js';
import { parseNodeResourceReferences, serializeNodeResourceReferences } from '../database/nodeResourceReferences.js';
import { hashTextBody } from '../database/textBodyHash.js';
import { collectArticleImageStorageKeys } from '../import/replaceArticleImageSource.js';

import type { DbPort } from './dbPort.js';
import type { SyncNodeAncestorGraph } from './syncNodeAncestorGraph.js';
import type { SyncNodeRecordSource } from './syncNodeRecordSource.js';
import { settleTopicAlternatives, writeTopicAlternative } from './topicAlternativeStore.js';
import { selectChangedTopicMain } from './topicTextConflictMetadata.js';
import { alternativeForBody } from './topicTextState.js';

export function alternativeImageFacts(record: Pick<NativeSyncNodeRecord, 'snapshot'>, body: string) {
  const keys = new Set(collectArticleImageStorageKeys(body));
  const references = parseNodeResourceReferences(record.snapshot.resource_references).filter(row => keys.has(row.storage_key));
  const sources = Object.fromEntries(Object.entries(parseImageSources(record.snapshot.image_sources))
    .filter(([key]) => keys.has(key)));
  return { resource_references: serializeNodeResourceReferences(references), image_sources: serializeImageSources(sources) };
}

/** Only actual conflict handling creates candidates; main-body editing does not inherit their payloads. */
export async function recordTopicConflictAlternatives(db: DbPort, source: SyncNodeRecordSource,
  winner: NativeSyncNodeRecord, formedAt: string, graph: SyncNodeAncestorGraph, settle = true) {
  const winnerBody = winner.body_text ?? winner.snapshot.content ?? '';
  for (const metadata of source.records) {
    const record = await source.load(db, metadata);
    const body = record.body_text ?? record.snapshot.content ?? '';
    if (body === winnerBody || await selectChangedTopicMain(db, record, winner, graph) === winner) continue;
    const entry = alternativeForBody(record, formedAt);
    const origin = record.snapshot.text_selection?.version_id ?? record.version_id!;
    const [author] = origin === record.version_id ? [] : await db.query<{ host_name: string }>(
      'SELECT host_name FROM node_sync_versions WHERE version_id = ?', [origin]);
    await writeTopicAlternative(db, { alternative_id: entry.id, node_id: record.object_id,
      source_version_id: origin, body_text: body, body_blob_hash: entry.body_blob_hash,
      source_host_name: author?.host_name ?? entry.source_host_name, created_at: entry.created_at,
      expires_at: entry.expires_at, status: 'available', updated_at: formedAt,
      ...alternativeImageFacts(record, body) }, true);
  }
  if (settle) await settleTopicAlternatives(db, winner.object_id, hashTextBody(winnerBody), formedAt);
}
