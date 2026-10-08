import { hashTextBody } from '../../lib/core/database/textBodyHash.js';
import { beginSyncGroupLocalAdoption } from '../../lib/core/sync/syncGroupLocalAdoption.js';
import { receiveSyncGroupRestoreEvent } from '../../lib/core/sync/syncGroupRestoreEvents.js';
import { loadCurrentSyncNodeRecord } from '../../lib/core/sync/syncNodeGraph.js';
import { createBetterSqlite3Driver } from '../database/betterSqlite3Driver.js';

import { verifiedApplyBusinessRows, verifiedApplyReadyRows, verifiedDesktopReadyFixture } from './desktopFramedSyncVerifiedApply.testSupport.js';

export type RestorePath = 'restore' | 'adoption';
const at = '2026-10-07T01:00:00.000Z';
const cacheText = '\ufeffCached 中😀\0text';
const incomingText = 'Surviving incoming text';

export async function verifiedRestoreFixture(path: RestorePath) {
  const body = '\ufeffNew restored 中😀\0body'.repeat(20_000);
  const host = await verifiedDesktopReadyFixture(body);
  host.sqlite.pragma('foreign_keys = ON');
  const driver = createBetterSqlite3Driver(host.sqlite);
  const oldHash = hashTextBody('Old unshared body');
  for (const id of ['old-node', 'special-inbox', 'special-virtual-root']) {
    host.sqlite.prepare(`INSERT OR IGNORE INTO nodes (id,kind,title,content,body_blob_hash,created_at,updated_at)
      VALUES (?,'topic',?,?,?,?,?)`).run(id, id, id === 'old-node' ? 'Old unshared body' : '',
      id === 'old-node' ? oldHash : hashTextBody(''), at, at);
  }
  host.sqlite.prepare(`INSERT INTO keep_import_item_cache (rule_id,source_path,title,content,
    source_mtime_ms,source_size_bytes,refreshed_at) VALUES ('rule','source.md','Cache',?,1,1,?)`).run(cacheText, at);
  const incoming = host.sqlite.prepare(`INSERT INTO incoming_updates (id,topic_id,source_type,source_path,
    updated_content,status,created_at,updated_at) VALUES (?,?,'markdown',? ,?,'pending',?,?)`);
  incoming.run('surviving', 'special-inbox', 'surviving.md', incomingText, at, at);
  incoming.run('discarded', 'old-node', 'discarded.md', 'Old unshared body', at, at);
  const adoption = { endpointUrl: 'https://example.test/sync', groupId: host.published.context.groupId,
    libraryEpoch: host.published.context.receiverLibraryEpoch, providerDeviceId: host.published.context.senderDeviceId,
    providerDeviceName: 'Sender', providerPlatform: 'desktop' };
  const restore = { groupId: host.published.context.groupId, restoreId: 'restore-event' };
  host.sqlite.prepare(`INSERT INTO sync_groups (group_id,display_name,workgroup_key,created_at,updated_at)
    VALUES (?,?,?,?,?)`).run(host.published.context.groupId, 'Restore group', 'fixture-key', at, at);
  if (path === 'adoption') await beginSyncGroupLocalAdoption(host.db, adoption);
  else await receiveSyncGroupRestoreEvent(host.db, { group_id: restore.groupId, restore_id: restore.restoreId,
    restored_at: at, source_device_identity_key: host.published.context.senderDeviceId });
  return { ...host, driver, body, path, oldHash,
    input: path === 'adoption' ? { adoption } : { restore } };
}

export function verifiedRestoreRows(host: Awaited<ReturnType<typeof verifiedRestoreFixture>>) {
  return { business: verifiedApplyBusinessRows(host), ready: verifiedApplyReadyRows(host),
    retained: ['settings', 'sync_group_metadata', 'sync_group_restore_events', 'keep_import_item_cache',
      'incoming_updates', 'search_index_invalidations', 'sync_state_sequence'].map((table) =>
      host.sqlite.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()) };
}

export async function verifiedRestoreEvidence(host: Awaited<ReturnType<typeof verifiedRestoreFixture>>) {
  const current = await loadCurrentSyncNodeRecord(host.db, host.record.object_id);
  if (!current) throw new Error('restored body unreadable');
  const incoming = host.driver.queryOne<{ updated_content: string }>(
    "SELECT updated_content FROM incoming_updates WHERE id = 'surviving'");
  return { current, bodies: [current.body_text, incoming?.updated_content], expectedBodies: [host.body, incomingText],
    oldManifest: host.driver.queryOne('SELECT hash FROM content_blobs WHERE hash = ?', [host.oldHash]),
    incomingIds: host.driver.queryAll<{ id: string }>('SELECT id FROM incoming_updates ORDER BY id').map((row) => row.id),
    cacheContent: host.driver.queryOne<{ content: string }>('SELECT content FROM keep_import_item_cache')?.content };
}
