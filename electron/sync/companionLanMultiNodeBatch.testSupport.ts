import Database from 'better-sqlite3';
import { expect } from 'vitest';

import { buildNodeBodyContentSql } from '../../lib/core/database/nodeBodySql.js';
import { encodeSyncPackFactClaims, type SyncPackFactIndex } from '../../lib/core/sync/syncPackFactPresence.js';
import { openDatabaseConnection } from '../database/connection.js';

import type { startAuthenticatedSyncHttp } from './companionLanAuthenticatedHttp.testSupport.js';

type TestServer = Awaited<ReturnType<typeof startAuthenticatedSyncHttp>>;

export interface BatchPeerIds { source: string; receiver: string; }

export function seedSource(ids: BatchPeerIds) {
  const driver = openDatabaseConnection().driver;
  driver.execute("INSERT INTO sync_groups VALUES ('group', 'Group', 'key', 'now', 'now')");
  driver.execute("INSERT INTO sync_group_local_state VALUES (1, 'group', ?, 'active', 'now')", [ids.source]);
  for (const [peerId, anchor, libraryPath] of [
    [ids.source, '11111111-1111-4111-8111-111111111111', '/source'],
    [ids.receiver, '22222222-2222-4222-8222-222222222222', '/receiver']
  ] as const) driver.execute(`INSERT INTO sync_group_devices
    (group_id, device_identity_key, device_anchor, canonical_library_path,
      device_name, platform, state, joined_at, updated_at)
    VALUES ('group', ?, ?, ?, 'Device', 'mac', 'active', 'now', 'now')`,
  [peerId, anchor, libraryPath]);
  for (let seq = 1; seq <= 3; seq++) {
    const id = `deleted-${seq}`;
    driver.execute(`INSERT INTO node_sync_tombstones
      (node_id, version_id, parent_version_id, host_name, content_hash,
        snapshot_json, deleted_at, created_at)
      VALUES (?, ?, NULL, 'source', 'deleted', ?, 'now', 'now')`,
    [id, `version-${seq}`, JSON.stringify({ id, deleted_at: 'now' })]);
    driver.execute(`INSERT INTO sync_object_state
      (object_type, object_id, state_seq, content_hash, updated_at,
        deleted_at, sync_dirty, last_modified_by_host_name)
      VALUES ('node', ?, ?, 'deleted', 'now', 'now', 0, 'source')`, [id, seq]);
  }
  driver.execute('UPDATE sync_state_sequence SET high_water = 3 WHERE singleton_id = 1');
}

export function seedMixedSource(ids: BatchPeerIds, softDeleted = false) {
  seedSource(ids);
  const driver = openDatabaseConnection().driver;
  driver.execute('DELETE FROM sync_object_state WHERE state_seq < 3');
  driver.execute("DELETE FROM node_sync_tombstones WHERE node_id <> 'deleted-3'");
  for (let seq = 1; seq <= 2; seq++) {
    const id = `live-${seq}`;
    driver.execute(`INSERT INTO nodes
      (id, kind, title, current_version_id, created_at, updated_at)
      VALUES (?, 'topic', ?, ?, 'now', 'now')`, [id, id, `version-${seq}`]);
    driver.execute(`INSERT INTO node_sync_versions
      (version_id, object_id, parent_version_id, host_name, created_at,
        content_hash, body_text, snapshot_json)
      VALUES (?, ?, NULL, 'source', 'now', ?, ?, ?)`,
    [`version-${seq}`, id, `hash-${seq}`, `body-${seq}`,
      JSON.stringify({ id, title: id, content: `body-${seq}` })]);
    driver.execute(`INSERT INTO sync_object_state
      (object_type, object_id, state_seq, content_hash, updated_at,
        sync_dirty, last_modified_by_host_name)
      VALUES ('node', ?, ?, ?, 'now', 0, 'source')`, [id, seq, `hash-${seq}`]);
  }
  for (let seq = 4; seq <= 5; seq++) driver.execute(`INSERT INTO sync_object_state
    (object_type, object_id, state_seq, content_hash, updated_at,
      sync_dirty, last_modified_by_host_name)
    VALUES ('node', ?, ?, ?, 'now', 0, 'source')`,
  [`orphan-${seq}`, seq, `hash-orphan-${seq}`]);
  if (softDeleted) {
    driver.execute("UPDATE nodes SET deleted_at = 'now' WHERE id = 'live-2'");
    driver.execute("UPDATE sync_object_state SET deleted_at = 'now' WHERE object_id = 'live-2'");
  }

}

export async function negotiateFactView(server: TestServer) {
    const firstPath = '/companion/sync-pack-facts?page_contract=bounded-v1&after_state_seq=0';
    let page = await server.getJson(firstPath) as unknown as
      { source_view_id: string; index?: SyncPackFactIndex; ready?: boolean };
    const viewId = page.source_view_id;
    const frontierStateSeq = openDatabaseConnection().driver.queryOne<{ high_water: number }>(
      'SELECT high_water FROM sync_state_sequence WHERE singleton_id = 1')!.high_water;
    expect(page.index?.to_state_seq).toBe(frontierStateSeq);
    expect(page.index?.frontier_state_seq).toBe(frontierStateSeq);
    for (let turn = 0; page.index && turn < 8; turn++) {
      const bits = encodeSyncPackFactClaims(page.index,
        { versions: [], parents: [], reviews: [] });
      const next = new URL(firstPath, server.origin);
      next.searchParams.set('fact_view', viewId);
      next.searchParams.set('frontier_state_seq', String(page.index.frontier_state_seq));
      next.searchParams.set('source_epoch', page.index.source_epoch);
      next.searchParams.set('fact_index_id', page.index.index_id);
      next.searchParams.set('have_v', bits.versions);
      next.searchParams.set('have_p', bits.parents);
      next.searchParams.set('have_r', bits.reviews);
      page = await server.getJson(next.pathname + next.search) as typeof page;
    }
    expect(page.ready).toBe(true);
  return { viewId, frontierStateSeq };
}

export function assertReceivedNodes(target: Database.Database, softDeleted: boolean) {
  expect(target.prepare('SELECT count(*) AS count FROM node_sync_versions').get())
    .toEqual({ count: 2 });
  expect(target.prepare('SELECT node_id FROM node_sync_tombstones').get())
    .toEqual({ node_id: 'deleted-3' });
  expect(target.prepare("SELECT name FROM sqlite_master WHERE name IN ('attachments', 'node_attachments')").all()).toEqual([]);
  if (softDeleted) expect(target.prepare("SELECT deleted_at FROM nodes WHERE id = 'live-2'").get())
    .toEqual({ deleted_at: 'now' });
  expect(target.prepare(`SELECT id, ${buildNodeBodyContentSql('nodes')} AS content FROM nodes LEFT JOIN content_blob_data cbd ON cbd.hash = nodes.body_blob_hash ORDER BY id`).all())
    .toEqual([{ id: 'live-1', content: 'body-1' }, { id: 'live-2', content: 'body-2' }]);
}
