import { upsertTextBodyBlob } from '../../lib/core/database/contentBodyBlobs.js';
import { beginSyncGroupLocalAdoption } from '../../lib/core/sync/syncGroupLocalAdoption.js';
import { receiveSyncGroupRestoreEvent } from '../../lib/core/sync/syncGroupRestoreEvents.js';
import { loadCurrentVerifiedSyncNode } from '../../lib/core/sync/syncNodeVerifiedGraph.js';
import { loadVerifiedBodyRef, readBodyText } from '../../lib/core/sync/verifiedBody.js';
import { createBetterSqlite3Driver } from '../database/betterSqlite3Driver.js';

import { verifiedApplyBusinessRows, verifiedApplyReadyRows, verifiedDesktopReadyFixture } from './desktopFramedSyncVerifiedApply.testSupport.js';

export type RestorePath = 'restore' | 'adoption';
const at = '2026-10-07T01:00:00.000Z';
const cacheText = '\ufeffCached 中😀\0text';
const incomingText = 'Surviving incoming text';

export async function verifiedRestoreFixture(path: RestorePath) {
  const body = '\ufeffNew restored 中😀\0body'.repeat(150_000);
  const host = await verifiedDesktopReadyFixture(body);
  host.sqlite.pragma('foreign_keys = ON');
  const driver = createBetterSqlite3Driver(host.sqlite);
  const oldHash = upsertTextBodyBlob(driver, 'Old unshared body', at, 'chunked');
  const cacheHash = upsertTextBodyBlob(driver, cacheText, at, 'chunked');
  const incomingHash = upsertTextBodyBlob(driver, incomingText, at, 'chunked');
  for (const id of ['old-node', 'special-inbox', 'special-virtual-root']) {
    host.sqlite.prepare(`INSERT OR IGNORE INTO nodes (id,kind,title,content,body_blob_hash,created_at,updated_at)
      VALUES (?,'topic',?,'',?,?,?)`).run(id, id, id === 'old-node' ? oldHash : null, at, at);
  }
  host.sqlite.prepare(`INSERT INTO keep_import_item_cache (rule_id,source_path,title,content,body_blob_hash,
    source_mtime_ms,source_size_bytes,refreshed_at) VALUES ('rule','source.md','Cache',NULL,?,1,1,?)`).run(cacheHash, at);
  const incoming = host.sqlite.prepare(`INSERT INTO incoming_updates (id,topic_id,source_type,source_path,
    updated_content,body_blob_hash,status,created_at,updated_at) VALUES (?,?,'markdown',?,'',?,'pending',?,?)`);
  incoming.run('surviving', 'special-inbox', 'surviving.md', incomingHash, at, at);
  incoming.run('discarded', 'old-node', 'discarded.md', oldHash, at, at);
  const adoption = { endpointUrl: 'https://example.test/sync', groupId: host.published.context.groupId,
    libraryEpoch: 'adopted-epoch', providerDeviceId: host.published.context.senderDeviceId,
    providerDeviceName: 'Sender', providerPlatform: 'desktop' };
  const restore = { groupId: host.published.context.groupId, restoreId: 'restore-event' };
  host.sqlite.prepare(`INSERT INTO sync_groups (group_id,display_name,workgroup_key,created_at,updated_at)
    VALUES (?,?,?,?,?)`).run(host.published.context.groupId, 'Restore group', 'fixture-key', at, at);
  if (path === 'adoption') await beginSyncGroupLocalAdoption(host.db, adoption);
  else await receiveSyncGroupRestoreEvent(host.db, { group_id: restore.groupId, restore_id: restore.restoreId,
    restored_at: at, source_device_identity_key: host.published.context.senderDeviceId });
  return { ...host, driver, body, path, oldHash, cacheHash, incomingHash,
    input: path === 'adoption' ? { adoption } : { restore } };
}

export function verifiedRestoreRows(host: Awaited<ReturnType<typeof verifiedRestoreFixture>>) {
  return { business: verifiedApplyBusinessRows(host), ready: verifiedApplyReadyRows(host),
    retained: ['settings', 'sync_group_metadata', 'sync_group_restore_events', 'keep_import_item_cache',
      'incoming_updates', 'search_index_invalidations', 'sync_state_sequence'].map((table) =>
      host.sqlite.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()) };
}

export async function verifiedRestoreEvidence(host: Awaited<ReturnType<typeof verifiedRestoreFixture>>) {
  const current = await loadCurrentVerifiedSyncNode(host.db, host.record.object_id);
  if (current?.body.kind !== 'readable') throw new Error('restored body unreadable');
  const bodies = [];
  for (const hash of [current.body.ref.hash, host.cacheHash, host.incomingHash]) {
    const ref = await loadVerifiedBodyRef(host.db, hash);
    if (!ref) throw new Error('surviving body unreadable');
    bodies.push(await readBodyText(host.db, ref));
  }
  return { current, bodies, expectedBodies: [host.body, cacheText, incomingText],
    oldBody: await loadVerifiedBodyRef(host.db, host.oldHash),
    oldManifest: host.driver.queryOne('SELECT hash FROM content_blobs WHERE hash = ?', [host.oldHash]),
    incomingIds: host.driver.queryAll<{ id: string }>('SELECT id FROM incoming_updates ORDER BY id').map((row) => row.id),
    cacheHash: host.driver.queryOne<{ body_blob_hash: string }>('SELECT body_blob_hash FROM keep_import_item_cache')?.body_blob_hash };
}
