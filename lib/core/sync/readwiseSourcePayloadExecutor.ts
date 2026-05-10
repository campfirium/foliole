import type { DbPort } from './dbPort.js';
import { asObject, integer, text, type JsonObject } from './syncObjectPayloadValues.js';
import type { SyncPackSyncObjectRecord } from './syncPackSyncObjectsExecutor.js';

export async function applyReadwiseSourceObject(port: DbPort, record: SyncPackSyncObjectRecord) {
  if (record.deleted_at) {
    await port.run('DELETE FROM readwise_source_annotations WHERE source_id = ?', [record.object_id]);
    await port.run('DELETE FROM readwise_sources WHERE source_id = ?', [record.object_id]);
    return;
  }
  const payload = asObject(record);
  await port.run(
    `INSERT INTO readwise_sources (
       source_id, account_id, reader_document_id, readwise_book_id, title, author, category, location,
       tags_json, source_url, raw_source_url, raw_source_url_status, remote_updated_at, sync_cursor,
       sync_status, source_state, promotion_lock, internal_node_id, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(source_id) DO UPDATE SET
       account_id = excluded.account_id,
       readwise_book_id = excluded.readwise_book_id, title = excluded.title, author = excluded.author,
       category = excluded.category, location = excluded.location, tags_json = excluded.tags_json,
       source_url = excluded.source_url, raw_source_url = excluded.raw_source_url,
       raw_source_url_status = excluded.raw_source_url_status, remote_updated_at = excluded.remote_updated_at,
       sync_cursor = excluded.sync_cursor, sync_status = excluded.sync_status, source_state = excluded.source_state,
       promotion_lock = excluded.promotion_lock, internal_node_id = excluded.internal_node_id,
       updated_at = excluded.updated_at`,
    [record.object_id, text(payload.account_id) ?? 'default', text(payload.reader_document_id) ?? record.object_id,
      text(payload.readwise_book_id), text(payload.title) ?? '', text(payload.author), text(payload.category),
      text(payload.location), JSON.stringify(readTags(payload)), text(payload.source_url), text(payload.raw_source_url),
      text(payload.raw_source_url_status) ?? 'unknown', text(payload.remote_updated_at), text(payload.sync_cursor),
      text(payload.sync_status) ?? 'idle', text(payload.source_state) ?? 'external',
      integer(payload.promotion_lock) === 1 ? 1 : 0, text(payload.internal_node_id),
      text(payload.updated_at) ?? record.updated_at, record.updated_at]
  );
  await replaceReadwiseAnnotations(port, record, payload);
}

async function replaceReadwiseAnnotations(port: DbPort, record: SyncPackSyncObjectRecord, payload: JsonObject) {
  await port.run('DELETE FROM readwise_source_annotations WHERE source_id = ?', [record.object_id]);
  const annotations = Array.isArray(payload.annotations) ? payload.annotations : [];
  for (const rawAnnotation of annotations) {
    const annotation = rawAnnotation && typeof rawAnnotation === 'object' ? rawAnnotation as JsonObject : {};
    const highlightId = text(annotation.highlight_id);
    const bookId = text(annotation.readwise_book_id) ?? text(payload.readwise_book_id);
    if (!highlightId || !bookId) continue;
    await port.run(
      `INSERT INTO readwise_source_annotations (
         source_id, readwise_book_id, highlight_id, reader_document_id, parent_id,
         annotation_kind, text, note, location, remote_updated_at, deleted_at, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [record.object_id, bookId, highlightId,
        text(payload.reader_document_id) ?? record.object_id, text(annotation.parent_id),
        text(annotation.annotation_kind) ?? 'highlight', text(annotation.text), text(annotation.note),
        text(annotation.location), text(annotation.remote_updated_at), text(annotation.deleted_at),
        record.updated_at, record.updated_at]
    );
  }
}

function readTags(payload: JsonObject) {
  return Array.isArray(payload.tags) ? payload.tags.filter((tag): tag is string => typeof tag === 'string') : [];
}
