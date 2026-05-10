import type { DbPort } from './dbPort.js';
import { asObject, text } from './syncObjectPayloadValues.js';
import type { SyncPackSyncObjectRecord } from './syncPackSyncObjectsExecutor.js';

export async function applyDocumentSourceObject(port: DbPort, record: SyncPackSyncObjectRecord) {
  if (record.deleted_at) {
    await port.run('DELETE FROM document_sources WHERE source_id = ?', [record.object_id]);
    return;
  }
  const payload = asObject(record);
  const internalNodeId = text(payload.internal_node_id);
  const presentationState = normalizePresentationState(payload.presentation_state, internalNodeId);
  await port.run(DOCUMENT_SOURCE_UPSERT_SQL, buildDocumentSourceParams(record, payload, presentationState, internalNodeId));
}

const DOCUMENT_SOURCE_UPSERT_SQL = `INSERT INTO document_sources (
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
   internalized_at = excluded.internalized_at,
   title = excluded.title,
   author = excluded.author,
   source_url = excluded.source_url,
   remote_updated_at = excluded.remote_updated_at,
   tags_json = excluded.tags_json,
   last_seen_at = excluded.last_seen_at,
   updated_at = excluded.updated_at`;

function buildDocumentSourceParams(
  record: SyncPackSyncObjectRecord,
  payload: Record<string, unknown>,
  presentationState: string,
  internalNodeId: string | null
) {
  return [
    record.object_id,
    text(payload.provider) ?? 'unknown',
    text(payload.provider_document_id) ?? record.object_id,
    text(payload.source_kind) ?? 'unknown',
    text(payload.source_name) ?? text(payload.title) ?? record.object_id,
    text(payload.source_locator) ?? record.object_id,
    text(payload.source_fingerprint) ?? record.object_id,
    text(payload.content_fingerprint) ?? record.content_hash,
    presentationState,
    normalizeAvailabilityState(payload.availability_state),
    normalizeSyncStatus(payload.sync_status),
    presentationState === 'internal' ? internalNodeId : null,
    presentationState === 'internal' ? text(payload.internalized_at) : null,
    text(payload.title),
    text(payload.author),
    text(payload.source_url),
    text(payload.remote_updated_at),
    text(payload.tags_json) ?? '[]',
    text(payload.first_seen_at) ?? record.updated_at,
    text(payload.last_seen_at) ?? record.updated_at,
    text(payload.created_at) ?? record.updated_at,
    text(payload.updated_at) ?? record.updated_at
  ];
}

function normalizePresentationState(value: unknown, internalNodeId: string | null) {
  const state = text(value) ?? 'external';
  if (state === 'internal') return internalNodeId ? 'internal' : 'external';
  return ['external', 'ignored'].includes(state) ? state : 'external';
}

function normalizeAvailabilityState(value: unknown) {
  const state = text(value) ?? 'available';
  return ['available', 'missing', 'deleted_remote', 'unknown'].includes(state) ? state : 'available';
}

function normalizeSyncStatus(value: unknown) {
  const state = text(value) ?? 'idle';
  return ['idle', 'syncing', 'synced', 'failed', 'rate_limited'].includes(state) ? state : 'idle';
}
