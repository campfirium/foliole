import { readFramedSyncPublication } from '../database/framedSyncStagingSerialization.js';
import type { DbPort, DbRow } from '../sync/dbPort.js';
import { framedSyncPublicationResources } from '../sync/framedSyncPublicationResources.js';
import { loadNodeOwnedArticleResourceNeeds } from '../sync/nodeOwnedArticleResourceNeeds.js';

export async function attachmentDatabaseRevision(port: DbPort) {
  const data = await port.query('PRAGMA data_version');
  const changes = await port.query('SELECT total_changes() AS changes');
  return JSON.stringify([data, changes]);
}

export async function readAttachmentReferenceSnapshot(port: DbPort, signal?: AbortSignal) {
  const revision = await attachmentDatabaseRevision(port);
  const articles = await port.query<{ id: string }>('SELECT id FROM nodes ORDER BY id');
  const storageKeys = new Set<string>();
  for (const article of articles) {
    signal?.throwIfAborted();
    const result = await loadNodeOwnedArticleResourceNeeds(port, [article.id]);
    if (result.unreadableArticleIds.length) throw new Error('attachment_scan_body_unreadable');
    for (const need of result.needs) storageKeys.add(need.storageKey);
  }
  const tables = await port.query<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'framed_sync_outbound_holds'");
  if (tables.length) {
    const held = await port.query<DbRow>(`SELECT publication.*
      FROM framed_sync_outbound_publications publication JOIN framed_sync_outbound_holds hold
      ON hold.transfer_id = publication.transfer_id`);
    for (const row of held) {
      for (const resource of framedSyncPublicationResources(readFramedSyncPublication(row).manifest).values()) {
        storageKeys.add(resource.storageKey);
      }
    }
  }
  const pins = await port.query<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'framed_sync_resource_pins'");
  if (pins.length) {
    for (const pin of await port.query<{ storage_key: string }>(
      'SELECT storage_key FROM framed_sync_resource_pins')) storageKeys.add(pin.storage_key);
  }
  if (revision !== await attachmentDatabaseRevision(port)) throw new Error('attachment_scan_database_changed');
  return { revision, storageKeys: [...storageKeys] };
}
