import type { DatabaseDriver, DatabaseRow } from './driver.js';
import type { ReadwiseSourceInput, ReadwiseSourceState, ReadwiseSourceSyncStatus } from './readwiseSourceTypes.js';
import { computeSyncContentHash, upsertSyncObjectState } from './syncState.js';

const DEFAULT_READWISE_ACCOUNT_ID = 'default';

interface ReadwiseSourceBackfillRow extends DatabaseRow {
  account_id: string;
  author: string | null;
  internal_node_id: string | null;
  reader_document_id: string;
  remote_updated_at: string | null;
  source_id: string;
  source_state: ReadwiseSourceState;
  source_url: string | null;
  sync_status: ReadwiseSourceSyncStatus;
  tags_json: string;
  title: string;
  updated_at: string;
}

export function toReadwiseDocumentSourcePayload(input: ReadwiseSourceInput) {
  const sourceId = encodeURIComponent(input.readerDocumentId);
  const accountId = input.accountId ?? DEFAULT_READWISE_ACCOUNT_ID;
  const presentationState = input.sourceState === 'internal' && input.internalNodeId ? 'internal' : 'external';
  return {
    author: input.author ?? null,
    availability_state: 'available',
    content_fingerprint: input.remoteUpdatedAt ?? input.updatedAt,
    internal_node_id: presentationState === 'internal' ? input.internalNodeId ?? null : null,
    internalized_at: presentationState === 'internal' ? input.updatedAt : null,
    last_seen_at: input.updatedAt,
    presentation_state: presentationState,
    provider: 'readwise_reader',
    provider_document_id: input.readerDocumentId,
    remote_updated_at: input.remoteUpdatedAt ?? null,
    source_fingerprint: `${accountId}:${sourceId}`,
    source_id: sourceId,
    source_kind: 'readwise_reader',
    source_locator: input.sourceUrl ?? `readwise://reader/${sourceId}`,
    source_name: input.title ?? '',
    source_url: input.sourceUrl ?? null,
    sync_status: input.syncStatus ?? 'idle',
    tags_json: JSON.stringify(input.tags ?? []),
    title: input.title ?? '',
    updated_at: input.updatedAt
  };
}

export function upsertReadwiseDocumentSource(
  driver: DatabaseDriver,
  payload: ReturnType<typeof toReadwiseDocumentSourcePayload>
) {
  driver.execute(
    `INSERT INTO document_sources (
       source_id, provider, provider_document_id, source_kind, source_name, source_locator,
       source_fingerprint, content_fingerprint, presentation_state, availability_state, sync_status,
       internal_node_id, internalized_at, title, author, source_url, remote_updated_at, tags_json,
       first_seen_at, last_seen_at, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(source_id) DO UPDATE SET
       provider = excluded.provider,
       provider_document_id = excluded.provider_document_id,
       source_kind = excluded.source_kind,
       source_name = excluded.source_name,
       source_locator = excluded.source_locator,
       source_fingerprint = excluded.source_fingerprint,
       content_fingerprint = excluded.content_fingerprint,
       presentation_state = excluded.presentation_state,
       availability_state = excluded.availability_state,
       sync_status = excluded.sync_status,
       internal_node_id = excluded.internal_node_id,
       internalized_at = COALESCE(document_sources.internalized_at, excluded.internalized_at),
       title = excluded.title,
       author = excluded.author,
       source_url = excluded.source_url,
       remote_updated_at = excluded.remote_updated_at,
       tags_json = excluded.tags_json,
       last_seen_at = excluded.last_seen_at,
       updated_at = excluded.updated_at`,
    [payload.source_id, payload.provider, payload.provider_document_id, payload.source_kind,
      payload.source_name, payload.source_locator, payload.source_fingerprint, payload.content_fingerprint,
      payload.presentation_state, payload.availability_state, payload.sync_status, payload.internal_node_id,
      payload.internalized_at, payload.title, payload.author, payload.source_url, payload.remote_updated_at,
      payload.tags_json, payload.updated_at, payload.last_seen_at, payload.updated_at, payload.updated_at]
  );
}

export function countReadwiseDocumentSources(driver: DatabaseDriver) {
  return Number(
    driver.queryOne<{ count: number }>(
      "SELECT COUNT(*) AS count FROM document_sources WHERE provider = 'readwise_reader'"
    )?.count ?? 0
  );
}

export function backfillReadwiseDocumentSources(driver: DatabaseDriver, deviceId: string) {
  const rows = driver.queryAll<ReadwiseSourceBackfillRow>(
    `SELECT source_id, account_id, reader_document_id, title, author, source_url, remote_updated_at,
       tags_json, sync_status, source_state, internal_node_id, updated_at
     FROM readwise_sources
     WHERE source_id NOT IN (
       SELECT source_id FROM document_sources WHERE provider = 'readwise_reader'
     )`
  );
  for (const row of rows) {
    const payload = toReadwiseDocumentSourcePayloadFromRow(row);
    upsertReadwiseDocumentSource(driver, payload);
    upsertSyncObjectState(driver, {
      objectType: 'document_source',
      objectId: payload.source_id,
      contentHash: computeSyncContentHash('document_source', payload),
      lastModifiedByDeviceId: deviceId,
      syncDirty: true,
      updatedAt: payload.updated_at
    });
  }
  return rows.length;
}

function toReadwiseDocumentSourcePayloadFromRow(row: ReadwiseSourceBackfillRow) {
  const presentationState = row.source_state === 'internal' && row.internal_node_id ? 'internal' : 'external';
  return {
    author: row.author,
    availability_state: 'available',
    content_fingerprint: row.remote_updated_at ?? row.updated_at,
    internal_node_id: presentationState === 'internal' ? row.internal_node_id : null,
    internalized_at: presentationState === 'internal' ? row.updated_at : null,
    last_seen_at: row.updated_at,
    presentation_state: presentationState,
    provider: 'readwise_reader',
    provider_document_id: row.reader_document_id,
    remote_updated_at: row.remote_updated_at,
    source_fingerprint: `${row.account_id}:${row.source_id}`,
    source_id: row.source_id,
    source_kind: 'readwise_reader',
    source_locator: row.source_url ?? `readwise://reader/${row.source_id}`,
    source_name: row.title,
    source_url: row.source_url,
    sync_status: row.sync_status,
    tags_json: row.tags_json,
    title: row.title,
    updated_at: row.updated_at
  };
}
