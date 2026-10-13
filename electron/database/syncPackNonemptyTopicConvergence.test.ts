// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { buildNodeBodyContentSql } from '../../lib/core/database/nodeBodySql.js';
import { computeNodeSyncHash } from '../../lib/core/database/nodeSyncHash.js';
import { nodeSyncSnapshotHashMetadata } from '../../lib/core/database/nodeSyncSnapshotMetadata.js';

import { closeLibraries, createPeer, joinPeers, startLibraries, type Peer } from './syncLibrary.testSupport.js';
import { withLibraryRequestSnapshot } from './syncRequestSnapshot.testSupport.js';

beforeEach(async () => {
  await startLibraries();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-07T01:00:00.000Z'));
});
afterEach(async () => { await closeLibraries(); vi.useRealTimers(); });

it('keeps both bodies when current requests join nonempty topic branches', async () => {
  const source = createPeer('source'); const target = createPeer('target');
  joinPeers(source, target);
  insertBranch(source, 'source', 'branch-b', 'Remote body', '2026-08-14T01:03:00.000Z');
  insertBranch(target, 'target', 'branch-a', 'Local body', '2026-08-14T01:02:00.000Z');
  await withLibraryRequestSnapshot(source, target, async toTarget => {
    await withLibraryRequestSnapshot(target, source, async toSource => {
      await toTarget();
      const before = readConflict(target);
      await toTarget();
      expect(readConflict(target)).toEqual(before);
      await toSource();
    });
  });
  const merged = readConflict(target);
  expect(merged.current_version_id).toMatch(/^ver_[a-f0-9]{24}$/);
  expect(merged.parents).toEqual(['branch-a', 'branch-b']);
  expect(new Set([merged.alternative.body_text, merged.projection.content]))
    .toEqual(new Set(['Local body', 'Remote body']));
  expect(merged.alternative.expires_at).toBe('2026-11-06T01:00:00.000Z');
  expect(readConflict(source)).toEqual(merged);
  const db = new Database(target.file, { readonly: true });
  try {
    expect(readConflict({ db })).toEqual(merged);
    expect(db.prepare("SELECT version_id FROM node_sync_versions WHERE object_id = 'shared-topic' ORDER BY version_id").all())
      .toEqual(['base', 'branch-a', 'branch-b', merged.current_version_id].sort().map(version_id => ({ version_id })));
    expect(db.prepare("SELECT COUNT(*) AS count FROM node_text_alternatives WHERE node_id = 'shared-topic' AND status = 'available'").get())
      .toEqual({ count: 0 });
  } finally { db.close(); }
});

function readConflict(peer: Pick<Peer, 'db'>) {
  const current = peer.db.prepare(
    `SELECT current_version_id FROM nodes WHERE id = 'shared-topic'`
  ).get() as { current_version_id: string };
  const parents = (peer.db.prepare(
    `SELECT parent_version_id AS id FROM node_sync_version_parents
     WHERE version_id = ? ORDER BY parent_version_id`
  ).all(current.current_version_id) as Array<{ id: string }>).map((row) => row.id);
  const projection = peer.db.prepare(
    `SELECT ${buildNodeBodyContentSql()} AS content FROM nodes n
     LEFT JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash WHERE n.id = 'shared-topic'`
  ).get() as { content: string };
  const version = peer.db.prepare(
    'SELECT snapshot_json, content_hash FROM node_sync_versions WHERE version_id = ?'
  ).get(current.current_version_id) as { snapshot_json: string; content_hash: string };
  const state = JSON.parse(version.snapshot_json);
  expect(state.text_alternatives).toHaveLength(1);
  const reference = state.text_alternatives[0];
  const body = state.text_alternative_bodies.find((entry: { hash: string }) => entry.hash === reference.body_blob_hash);
  expect(body).toBeDefined();
  const alternative = { ...reference, body_text: body.text };
  return { alternative, current_version_id: current.current_version_id, parents, projection,
    snapshot: JSON.parse(version.snapshot_json), contentHash: version.content_hash };
}

function insertBranch(peer: Peer, device: string, versionId: string, body: string, updatedAt: string) {
  const db = peer.db;
  db.prepare(
    `INSERT INTO nodes (
       id, kind, title, is_title_manual, hide_title_heading, content,
       current_version_id, created_at, updated_at
     ) VALUES ('shared-topic', 'topic', 'Shared Topic', 1, 0, ?, ?, ?, ?)`
  ).run(body, versionId, '2026-08-14T01:00:00.000Z', updatedAt);
  const baseSnapshot = snapshot('Base body', '2026-08-14T01:00:00.000Z');
  const branchSnapshot = snapshot(body, updatedAt);
  db.prepare(
    `INSERT INTO node_sync_versions (
       version_id, object_id, parent_version_id, host_name, created_at,
       content_hash, body_text, snapshot_json
     ) VALUES (?, 'shared-topic', ?, ?, ?, ?, ?, ?)`
  ).run('base', null, 'origin', '2026-08-14T01:00:00.000Z', versionHash(baseSnapshot), 'Base body', JSON.stringify(baseSnapshot));
  db.prepare(
    `INSERT INTO node_sync_versions (
       version_id, object_id, parent_version_id, host_name, created_at,
       content_hash, body_text, snapshot_json
     ) VALUES (?, 'shared-topic', 'base', ?, ?, ?, ?, ?)`
  ).run(versionId, device, updatedAt, versionHash(branchSnapshot), body, JSON.stringify(branchSnapshot));
  db.prepare(
    `INSERT INTO sync_object_state (
       object_type, object_id, state_seq, current_version_id, content_hash,
       last_modified_by_host_name, updated_at, sync_dirty
     ) VALUES ('node', 'shared-topic', 1, ?, ?, ?, ?, 1)`
  ).run(versionId, versionHash(branchSnapshot), device, updatedAt);
  db.prepare('INSERT INTO node_sync_version_parents VALUES (?, ?, 0)').run(versionId, 'base');
}

function snapshot(content: string, updatedAt: string) {
  return {
    anchor_link: null, attachments: [], content, created_at: '2026-08-14T01:00:00.000Z',
    deleted_at: null, desired_retention: null, hide_title_heading: false, id: 'shared-topic',
    image_regions: null, resource_references: '[]', is_title_manual: true, kind: 'topic', opening_text: null,
    parent_id: null, position: null, priority: null, reveal: null, title: 'Shared Topic',
    updated_at: updatedAt, virtual_filter: null
  };
}


function versionHash(value: ReturnType<typeof snapshot>) {
  return computeNodeSyncHash({ ...nodeSyncSnapshotHashMetadata(value), content: value.content });
}
