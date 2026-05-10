import type { DatabaseRow } from '../../lib/core/database/driver.js';

import { openDatabaseConnection } from './connection.js';

interface ReadwiseSourcePayloadRow extends DatabaseRow {
  account_id: string;
  author: string | null;
  category: string | null;
  internal_node_id: string | null;
  location: string | null;
  promotion_lock: number;
  raw_source_url: string | null;
  raw_source_url_status: string;
  reader_document_id: string;
  readwise_book_id: string | null;
  remote_updated_at: string | null;
  source_id: string;
  source_state: string;
  source_url: string | null;
  sync_cursor: string | null;
  sync_status: string;
  tags_json: string;
  title: string;
  updated_at: string;
}

interface ReadwiseAnnotationPayloadRow extends DatabaseRow {
  annotation_kind: string;
  deleted_at: string | null;
  highlight_id: string;
  location: string | null;
  note: string | null;
  parent_id: string | null;
  readwise_book_id: string;
  remote_updated_at: string | null;
  text: string | null;
}

export function readReadwiseSourcePayloadJson(sourceId: string) {
  const driver = openDatabaseConnection().driver;
  const row = driver.queryOne<ReadwiseSourcePayloadRow>(
    `SELECT source_id, reader_document_id, readwise_book_id, title, author, category, location,
       account_id, tags_json, source_url, raw_source_url, raw_source_url_status, remote_updated_at, sync_cursor,
       sync_status, source_state, promotion_lock, internal_node_id, updated_at
     FROM readwise_sources WHERE source_id = ?`,
    [sourceId]
  );
  if (!row) return null;
  const annotations = driver.queryAll<ReadwiseAnnotationPayloadRow>(
    `SELECT annotation_kind, deleted_at, highlight_id, location, note, parent_id, readwise_book_id,
       remote_updated_at, text
     FROM readwise_source_annotations WHERE source_id = ?
     ORDER BY remote_updated_at ASC, highlight_id ASC`,
    [sourceId]
  );
  return JSON.stringify({
    account_id: row.account_id,
    annotations,
    author: row.author,
    category: row.category,
    internal_node_id: row.internal_node_id,
    location: row.location,
    promotion_lock: row.promotion_lock,
    raw_source_url: row.raw_source_url,
    raw_source_url_status: row.raw_source_url_status,
    reader_document_id: row.reader_document_id,
    readwise_book_id: row.readwise_book_id,
    remote_updated_at: row.remote_updated_at,
    source_id: row.source_id,
    source_state: row.source_state,
    source_url: row.source_url,
    sync_cursor: row.sync_cursor,
    sync_status: row.sync_status,
    tags: parseTags(row.tags_json),
    title: row.title,
    updated_at: row.updated_at
  });
}

function parseTags(tagsJson: string) {
  const parsed = JSON.parse(tagsJson) as unknown;
  return Array.isArray(parsed) ? parsed.filter((tag): tag is string => typeof tag === 'string') : [];
}
