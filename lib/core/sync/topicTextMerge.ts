import type { NativeSyncNodeRecord } from '../../platform/nativeSyncContract.js';

import type { DbPort } from './dbPort.js';
import { loadMergeBaseCandidates } from './syncNodeGraph.js';
import { arraySyncNodeRecordSource, type SyncNodeRecordMetadata, type SyncNodeRecordSource } from './syncNodeRecordSource.js';
import { selectChangedTopicMain } from './topicTextConflictMetadata.js';
import { alternativeForBody, normalizeTextAlternatives, textAlternatives } from './topicTextState.js';

/** Merge attachment membership against shared history without comparing full text lines. */
export function mergeTopicTextAttachments(db: DbPort, records: NativeSyncNodeRecord[],
  winner: NativeSyncNodeRecord, formedAt: string) {
  return mergeTopicTextSourceAttachments(db, arraySyncNodeRecordSource(records), winner, formedAt);
}

export async function mergeTopicTextSourceAttachments<M extends SyncNodeRecordMetadata>(db: DbPort, source: SyncNodeRecordSource<M>,
  winner: NativeSyncNodeRecord, formedAt: string) {
  const records = source.records;
  const removed = await removedTopicTextAttachments(db, records);
  const winnerBody = winner.body_text ?? winner.snapshot.content ?? '';
  const entries = records.flatMap(textAlternatives).filter((entry) => !removed.has(entry.id));
  for (const metadata of records) {
    const record = await source.load(db, metadata);
    const body = record.body_text ?? record.snapshot.content ?? '';
    if (body === winnerBody) continue;
    if (await selectChangedTopicMain(db, record, winner) === winner) continue;
    const entry = alternativeForBody(record, formedAt);
    const sourceId = record.snapshot.text_selection?.version_id;
    if (sourceId && sourceId !== record.version_id) {
      const [source] = await db.query<{ host_name: string }>(
        'SELECT host_name FROM node_sync_versions WHERE version_id = ?', [sourceId]);
      if (source) entry.source_host_name = source.host_name;
    }
    if (removed.has(entry.id)) continue;
    entries.push(entry);
  }
  return normalizeTextAlternatives(entries, winnerBody, formedAt);
}

export async function removedTopicTextAttachments(db: DbPort, records: readonly SyncNodeRecordMetadata[]) {
  const removed = new Set<string>();
  for (let index = 0; index < records.length; index++) {
    const left = records[index]!;
    for (const right of records.slice(index + 1)) {
      const bases = await loadMergeBaseCandidates(db, left.version_id!, right.version_id!);
      for (const versionId of bases) {
        const [row] = await db.query<{ alternatives: string | null }>(
          "SELECT json_extract(snapshot_json, '$.text_alternatives') AS alternatives FROM node_sync_versions WHERE version_id = ?", [versionId]);
        if (!row) continue;
        const entries: NativeSyncNodeRecord['snapshot']['text_alternatives'] = JSON.parse(row.alternatives ?? '[]');
        const leftIds = new Set(textAlternatives(left).map((entry) => entry.id));
        const rightIds = new Set(textAlternatives(right).map((entry) => entry.id));
        for (const entry of entries ?? []) {
          if (!leftIds.has(entry.id) || !rightIds.has(entry.id)) removed.add(entry.id);
        }
      }
    }
  }
  return removed;
}
