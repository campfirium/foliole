// @vitest-environment node
import { afterEach, beforeEach, expect, it } from 'vitest';

import { receiveMemberPositionFixture } from '../../../electron/database/nodeVersionMemberPosition.testSupport.js';
import { closeLibraries, createPeer, joinPeers, startLibraries, type Peer } from '../../../electron/database/syncLibrary.testSupport.js';
import { withLibraryRequestSnapshot } from '../../../electron/database/syncRequestSnapshot.testSupport.js';
import { buildCanonicalNodeSyncPayload } from '../../../lib/core/database/nodeSyncPayload.js';
import { nodeSyncSnapshotHashMetadata } from '../../../lib/core/database/nodeSyncSnapshotMetadata.js';
import { computeSyncContentHash } from '../../../lib/core/database/syncState.js';
import { releaseLocalEditBase, retainLocalEditBase } from '../../../lib/core/sync/nodeVersionLocalEditHold.js';
import { nodePositionPayloadSchema } from '../../../lib/core/sync/nodeVersionMemberPositionFact.js';
import { publishLocalNodePosition } from '../../../lib/core/sync/nodeVersionMemberPositionPublish.js';
import { collectNodeVersionPayloads } from '../../../lib/core/sync/nodeVersionPayloadCollector.js';
import { loadCurrentSyncNodeRecord } from '../../../lib/core/sync/syncNodeGraph.js';

const nodeId = 'offline-topic';
const createdAt = '2026-09-27T00:00:00.000Z';
beforeEach(startLibraries);
afterEach(closeLibraries);

it('replays a trimmed A to E chain into an offline A to F branch through current requests', async () => {
  const online = createPeer('online');
  const offline = createPeer('offline');
  joinPeers(online, offline);
  seedNode(online, 'E', 'left edited\nright one');
  for (const [id, parent, content] of [
    ['A', null, 'left one\nright one'],
    ['B', 'A', 'left draft\nright one'],
    ['C', 'B', 'left revised\nright one'],
    ['D', 'C', 'left almost\nright one'],
    ['E', 'D', 'left edited\nright one']
  ] as const) insertVersion(online, id, parent, content);
  seedNode(offline, 'A', 'left one\nright one');
  insertVersion(offline, 'A', null, 'left one\nright one');
  await transferPosition(offline, online);
  expect(await collectNodeVersionPayloads(online.port, nodeId))
    .toEqual({ released: 3, skipped: null });
  expect(versionBodies(online)).toEqual([['A', 'left one\nright one'],
    ['B', null], ['C', null], ['D', null], ['E', 'left edited\nright one']]);
  expect(online.db.prepare('SELECT parent_version_id FROM node_sync_version_parents WHERE version_id = ?')
    .all('E')).toEqual([{ parent_version_id: 'D' }]);
  offline.db.prepare('UPDATE nodes SET content = ?, current_version_id = ? WHERE id = ?')
    .run('left one\nright edited', 'F', nodeId);
  insertVersion(offline, 'F', 'A', 'left one\nright edited');
  const port = offline.port;
  await retainLocalEditBase(port, { holdId: 'offline-editor', nodeId, versionId: 'F' });
  await withLibraryRequestSnapshot(online, offline, async replay => { await replay(); });
  const current = offline.db.prepare(`SELECT content, current_version_id FROM nodes WHERE id = ?`)
    .get(nodeId) as { content: string; current_version_id: string };
  const chosen = await loadCurrentSyncNodeRecord(port, nodeId);
  expect(new Set([chosen?.body_text, ...chosen?.alternative_bodies?.map(body => body.text) ?? []]))
    .toEqual(new Set(['left edited\nright one', 'left one\nright edited']));
  expect(current.current_version_id).toMatch(/^ver_[a-f0-9]{24}$/);
  await transferPosition(online, offline);
  expect((await loadCurrentSyncNodeRecord(port, nodeId))?.version_id).toBe(current.current_version_id);
  expect(versionBodies(offline)).toContainEqual(['F', 'left one\nright edited']);
  await releaseLocalEditBase(port, 'offline-editor', nodeId);
  expect(versionBodies(offline)).toEqual([['A', null],
    ['B', null], ['C', null], ['D', null], ['E', 'left edited\nright one'],
    ['F', null], [current.current_version_id, current.content]]);
  expect(offline.db.prepare("SELECT version_id FROM node_sync_versions WHERE version_id IN ('A', 'F') AND json_extract(snapshot_json, '$.body_deleted') = 1 ORDER BY version_id")
    .all()).toEqual([{ version_id: 'A' }, { version_id: 'F' }]);
  expect(offline.db.prepare(`SELECT parent_version_id FROM node_sync_version_parents
    WHERE version_id = ? ORDER BY ordinal`).all(current.current_version_id))
    .toEqual([{ parent_version_id: 'E' }, { parent_version_id: 'F' }]);
  expect(offline.db.prepare(`SELECT body_text,
    json_extract(snapshot_json, '$.content') AS snapshot_content
    FROM node_sync_versions WHERE version_id = ?`).get(current.current_version_id))
    .toEqual({ body_text: current.content, snapshot_content: null });
  await withLibraryRequestSnapshot(offline, online, async replay => { await replay(); });
  expect(online.db.prepare('SELECT content, current_version_id FROM nodes WHERE id = ?').get(nodeId)).toEqual(current);
});

function seedNode(peer: Peer, versionId: string, content: string) {
  const db = peer.db;
  db.prepare(`INSERT INTO nodes
    (id, kind, title, is_title_manual, hide_title_heading, content,
     current_version_id, created_at, updated_at)
    VALUES (?, 'topic', 'Offline Topic', 1, 0, ?, ?, ?, ?)`)
    .run(nodeId, content, versionId, createdAt, createdAt);
  db.prepare(`INSERT INTO sync_object_state
    (object_type, object_id, state_seq, current_version_id, content_hash,
     last_modified_by_host_name, updated_at, sync_dirty)
    VALUES ('node', ?, 1, ?, ?, 'online-device', ?, 1)`)
    .run(nodeId, versionId, `hash-${versionId}`, createdAt);
}

function insertVersion(peer: Peer, id: string, parent: string | null, content: string) {
  const db = peer.db;
  const snapshot = { anchor_link: null, attachments: [], content, created_at: createdAt,
    deleted_at: null, desired_retention: null, hide_title_heading: false, id: nodeId,
    image_regions: null, is_title_manual: true, kind: 'topic' as const, opening_text: null,
    parent_id: null, position: null, priority: null, reveal: null,
    title: 'Offline Topic', updated_at: createdAt, virtual_filter: null };
  db.prepare(`INSERT INTO node_sync_versions
    (version_id, object_id, parent_version_id, host_name, created_at,
     content_hash, body_text, snapshot_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, nodeId, parent, id === 'F' ? 'offline-device' : 'online-device',
      createdAt, computeSyncContentHash('node', buildCanonicalNodeSyncPayload({
        ...nodeSyncSnapshotHashMetadata(snapshot), content })), content, JSON.stringify(snapshot));
  db.prepare('UPDATE sync_object_state SET content_hash = (SELECT content_hash FROM node_sync_versions WHERE version_id = ?), current_version_id = ? WHERE object_id = ? AND EXISTS (SELECT 1 FROM nodes WHERE id = ? AND current_version_id = ?)')
    .run(id, id, nodeId, nodeId, id);
  if (parent) db.prepare(`INSERT INTO node_sync_version_parents VALUES (?, ?, 0)`).run(id, parent);
}


function versionBodies(peer: Peer) {
  return (peer.db.prepare('SELECT version_id, body_text FROM node_sync_versions WHERE object_id = ? ORDER BY version_id')
    .all(nodeId) as Array<{ version_id: string; body_text: string | null }>).map(row => [row.version_id, row.body_text]);
}

async function transferPosition(author: Peer, receiver: Peer) {
  await author.port.transaction(db => publishLocalNodePosition(db, nodeId));
  const row = author.db.prepare(`SELECT adopted_version_id, device_identity_key, group_id, library_epoch, object_id,
    pending_version_ids_json, proof_revision, updated_at FROM node_version_member_positions
    WHERE device_identity_key = ? AND object_id = ?`)
    .get(author.id, nodeId);
  await receiveMemberPositionFixture(receiver.port, nodePositionPayloadSchema.parse(row));
}
