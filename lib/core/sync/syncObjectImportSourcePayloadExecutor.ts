import type { DbPort } from './dbPort.js';
import { asObject, text } from './syncObjectPayloadValues.js';
import type { SyncPackSyncObjectRecord } from './syncPackSyncObjectsExecutor.js';

export async function applyImportSourceObject(port: DbPort, record: SyncPackSyncObjectRecord) {
  if (record.deleted_at) {
    await port.run('DELETE FROM import_sources WHERE source_fingerprint = ?', [record.object_id]);
    return;
  }
  const payload = asObject(record);
  await port.run(
    `INSERT INTO import_sources (source_fingerprint, provider, source_kind, source_name, source_locator, ` +
    `first_imported_at, last_imported_at, last_content_fingerprint, latest_node_id, watched_binding_id, ` +
    `watched_relative_path, source_ref, source_location) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ` +
    `ON CONFLICT(source_fingerprint) DO UPDATE SET provider = excluded.provider, source_kind = excluded.source_kind, ` +
    `source_name = excluded.source_name, source_locator = excluded.source_locator, last_imported_at = excluded.last_imported_at, ` +
    `last_content_fingerprint = excluded.last_content_fingerprint, latest_node_id = excluded.latest_node_id, ` +
    `watched_binding_id = COALESCE(excluded.watched_binding_id, import_sources.watched_binding_id), ` +
    `watched_relative_path = COALESCE(excluded.watched_relative_path, import_sources.watched_relative_path), ` +
    `source_ref = COALESCE(excluded.source_ref, import_sources.source_ref), ` +
    `source_location = COALESCE(excluded.source_location, import_sources.source_location)`,
    [record.object_id, text(payload.provider) ?? 'unknown', text(payload.source_kind) ?? 'unknown',
      text(payload.source_name) ?? record.object_id, text(payload.source_locator) ?? record.object_id,
      text(payload.first_imported_at) ?? record.updated_at, text(payload.last_imported_at) ?? record.updated_at,
      text(payload.last_content_fingerprint) ?? record.content_hash, text(payload.latest_node_id),
      text(payload.watched_binding_id), text(payload.watched_relative_path), text(payload.source_ref),
      text(payload.source_location)]
  );
}
