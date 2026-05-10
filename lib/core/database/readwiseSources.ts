import type { DatabaseDriver, DatabaseRow } from './driver.js';
import type {
  ReadwiseSourceAnnotation,
  ReadwiseSourceInput,
  ReadwiseSourceRecord,
  ReadwiseSourceState,
  ReadwiseSourceSyncStatus
} from './readwiseSourceTypes.js';
import { toReadwiseDocumentSourcePayload, upsertReadwiseDocumentSource } from './readwiseDocumentSources.js';
import { computeSyncContentHash, upsertSyncObjectState } from './syncState.js';

export type {
  ReadwiseSourceAnnotation,
  ReadwiseSourceInput,
  ReadwiseSourceRecord,
  ReadwiseSourceState,
  ReadwiseSourceSyncStatus
} from './readwiseSourceTypes.js';

export const DEFAULT_READWISE_ACCOUNT_ID = 'default';

interface ReadwiseSourceRow extends DatabaseRow {
  account_id: string;
  author: string | null;
  category: string | null;
  created_at: string;
  internal_node_id: string | null;
  location: string | null;
  promotion_lock: number;
  raw_source_url: string | null;
  raw_source_url_status: string;
  reader_document_id: string;
  readwise_book_id: string | null;
  remote_updated_at: string | null;
  source_id: string;
  source_state: ReadwiseSourceState;
  source_url: string | null;
  sync_cursor: string | null;
  sync_status: ReadwiseSourceSyncStatus;
  tags_json: string;
  title: string;
  updated_at: string;
}

interface ReadwiseAnnotationRow extends DatabaseRow {
  annotation_kind: 'highlight' | 'note';
  deleted_at: string | null;
  highlight_id: string;
  location: string | null;
  note: string | null;
  parent_id: string | null;
  readwise_book_id: string;
  remote_updated_at: string | null;
  text: string | null;
}

export function toReadwiseSourceId(readerDocumentId: string) {
  return encodeURIComponent(readerDocumentId);
}

export function toReadwiseSourcePayload(input: ReadwiseSourceInput) {
  return {
    account_id: input.accountId ?? DEFAULT_READWISE_ACCOUNT_ID,
    annotations: normalizeAnnotations(input),
    author: input.author ?? null,
    category: input.category ?? null,
    internal_node_id: input.internalNodeId ?? null,
    location: input.location ?? null,
    promotion_lock: input.promotionLock ? 1 : 0,
    raw_source_url: input.rawSourceUrl ?? null,
    raw_source_url_status: input.rawSourceUrlStatus ?? 'unknown',
    reader_document_id: input.readerDocumentId,
    readwise_book_id: input.readwiseBookId ?? null,
    remote_updated_at: input.remoteUpdatedAt ?? null,
    source_id: toReadwiseSourceId(input.readerDocumentId),
    source_state: input.sourceState ?? 'external',
    source_url: input.sourceUrl ?? null,
    sync_cursor: input.syncCursor ?? null,
    sync_status: input.syncStatus ?? 'idle',
    tags: input.tags ?? [],
    title: input.title ?? '',
    updated_at: input.updatedAt
  };
}

export function upsertReadwiseSource(driver: DatabaseDriver, input: ReadwiseSourceInput) {
  const payload = toReadwiseSourcePayload(input);
  const documentSource = toReadwiseDocumentSourcePayload(input);
  driver.transaction((tx) => {
    upsertReadwiseDocumentSource(tx, documentSource);
    tx.execute(
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
      [payload.source_id, payload.account_id, payload.reader_document_id, payload.readwise_book_id, payload.title,
        payload.author, payload.category, payload.location, JSON.stringify(payload.tags), payload.source_url,
        payload.raw_source_url, payload.raw_source_url_status, payload.remote_updated_at, payload.sync_cursor,
        payload.sync_status, payload.source_state, payload.promotion_lock, payload.internal_node_id,
        payload.updated_at, payload.updated_at]
    );
    replaceAnnotations(tx, payload);
  });
  return payload.source_id;
}

export function upsertReadwiseSourceWithSyncState(driver: DatabaseDriver, input: ReadwiseSourceInput, deviceId: string) {
  const sourceId = upsertReadwiseSource(driver, input);
  upsertSyncObjectState(driver, {
    objectType: 'document_source',
    objectId: sourceId,
    contentHash: computeSyncContentHash('document_source', toReadwiseDocumentSourcePayload(input)),
    lastModifiedByDeviceId: deviceId,
    syncDirty: true,
    updatedAt: input.updatedAt
  });
  upsertSyncObjectState(driver, {
    objectType: 'readwise_source',
    objectId: sourceId,
    contentHash: computeSyncContentHash('readwise_source', toReadwiseSourcePayload(input)),
    lastModifiedByDeviceId: deviceId,
    syncDirty: true,
    updatedAt: input.updatedAt
  });
  return sourceId;
}


export function readReadwiseSource(driver: DatabaseDriver, sourceId: string): ReadwiseSourceRecord | null {
  const row = driver.queryOne<ReadwiseSourceRow>('SELECT * FROM readwise_sources WHERE source_id = ?', [sourceId]);
  if (!row) return null;
  return {
    annotations: readAnnotations(driver, sourceId),
    accountId: row.account_id,
    author: row.author,
    category: row.category,
    createdAt: row.created_at,
    internalNodeId: row.internal_node_id,
    location: row.location,
    promotionLock: row.promotion_lock === 1,
    rawSourceUrl: row.raw_source_url,
    rawSourceUrlStatus: row.raw_source_url_status,
    readerDocumentId: row.reader_document_id,
    readwiseBookId: row.readwise_book_id,
    remoteUpdatedAt: row.remote_updated_at,
    sourceId: row.source_id,
    sourceState: row.source_state,
    sourceUrl: row.source_url,
    syncCursor: row.sync_cursor,
    syncStatus: row.sync_status,
    tags: parseTags(row.tags_json),
    title: row.title,
    updatedAt: row.updated_at
  };
}

function normalizeAnnotations(input: ReadwiseSourceInput) {
  return (input.annotations ?? []).map((annotation) => ({
    annotation_kind: annotation.annotationKind ?? 'highlight',
    deleted_at: annotation.deletedAt ?? null,
    highlight_id: annotation.highlightId,
    location: annotation.location ?? null,
    note: annotation.note ?? null,
    parent_id: annotation.parentId ?? null,
    readwise_book_id: annotation.readwiseBookId ?? input.readwiseBookId ?? '',
    remote_updated_at: annotation.remoteUpdatedAt ?? null,
    text: annotation.text ?? null
  }));
}

function replaceAnnotations(driver: DatabaseDriver, payload: ReturnType<typeof toReadwiseSourcePayload>) {
  driver.execute('DELETE FROM readwise_source_annotations WHERE source_id = ?', [payload.source_id]);
  for (const annotation of payload.annotations) {
    if (!annotation.highlight_id || !annotation.readwise_book_id) continue;
    driver.execute(
      `INSERT INTO readwise_source_annotations (
         source_id, readwise_book_id, highlight_id, reader_document_id, parent_id,
         annotation_kind, text, note, location, remote_updated_at, deleted_at, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [payload.source_id, annotation.readwise_book_id, annotation.highlight_id,
        payload.reader_document_id, annotation.parent_id, annotation.annotation_kind, annotation.text, annotation.note,
        annotation.location, annotation.remote_updated_at, annotation.deleted_at, payload.updated_at, payload.updated_at]
    );
  }
}

function readAnnotations(driver: DatabaseDriver, sourceId: string): ReadwiseSourceAnnotation[] {
  return driver.queryAll<ReadwiseAnnotationRow>(
    `SELECT annotation_kind, deleted_at, highlight_id, location, note, parent_id, readwise_book_id,
       remote_updated_at, text
     FROM readwise_source_annotations WHERE source_id = ?
     ORDER BY remote_updated_at ASC, highlight_id ASC`,
    [sourceId]
  ).map((row) => ({
    annotationKind: row.annotation_kind,
    deletedAt: row.deleted_at,
    highlightId: row.highlight_id,
    location: row.location,
    note: row.note,
    parentId: row.parent_id,
    readwiseBookId: row.readwise_book_id,
    remoteUpdatedAt: row.remote_updated_at,
    text: row.text
  }));
}

function parseTags(tagsJson: string) {
  const parsed = JSON.parse(tagsJson) as unknown;
  return Array.isArray(parsed) ? parsed.filter((tag): tag is string => typeof tag === 'string') : [];
}
