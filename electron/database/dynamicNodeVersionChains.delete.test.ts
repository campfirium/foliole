// @vitest-environment node
import { createHash } from 'node:crypto';

import { afterEach, beforeEach, expect, it } from 'vitest';

import { releaseLocalEditBase, retainLocalEditBase } from '../../lib/core/sync/nodeVersionLocalEditHold.js';

import { permanentlyDelete } from './dynamicNodeVersionChains.delete.testSupport.js';
import { closeLibraries, createPeer, edit, history, joinPeers, startLibraries,
  type Peer } from './syncLibrary.testSupport.js';

beforeEach(startLibraries);
afterEach(closeLibraries);

function expectDeletion(peer: Peer, previous: string) {
  const tombstone = permanentlyDelete(peer);
  const versions = history(peer);
  expect(tombstone.version_id).not.toBe(previous);
  expect(tombstone.parent_version_id).toBe(previous);
  expect(JSON.parse(tombstone.snapshot_json)).toMatchObject({ id: 'topic', deleted_at: '2026-10-01T00:00:00.000Z' });
  expect(versions.find(row => row.version_id === tombstone.version_id)?.body_text).toBe('body');
  expect(versions.find(row => row.version_id === previous)?.body_text).toBeNull();
  expect(JSON.parse(versions.find(row => row.version_id === previous)!.snapshot_json))
    .toMatchObject({ id: 'topic', content: null, body_deleted: true,
      body_blob_hash: createHash('sha256').update('body').digest('hex') });
  expect(peer.db.prepare("SELECT id FROM nodes WHERE id = 'topic'").get()).toBeUndefined();
  expect(peer.db.prepare("SELECT current_version_id, deleted_at FROM sync_object_state WHERE object_type = 'node' AND object_id = 'topic'").get())
    .toEqual({ current_version_id: tombstone.version_id, deleted_at: '2026-10-01T00:00:00.000Z' });
}

it('keeps an unheld pre-delete identity outside a group and the complete deletion fact', () => {
  const peer = createPeer('local');
  expectDeletion(peer, edit(peer, 'body'));
});

it('does not treat group membership alone as a concrete send', () => {
  const peer = createPeer('local');
  joinPeers(peer, createPeer('remote'));
  peer.db.exec("UPDATE sync_group_devices SET joined_at = '2025-01-01T00:00:00.000Z'");
  const version = edit(peer, 'body');
  expectDeletion(peer, version);
});

it('retains the editor baseline identity through permanent deletion until release', async () => {
  const peer = createPeer('local');
  const version = edit(peer, 'body');
  await retainLocalEditBase(peer.port, { holdId: 'draft', nodeId: 'topic', versionId: version });
  expectDeletion(peer, version);
  expect(peer.db.prepare("SELECT version_id FROM node_version_local_holds WHERE hold_id = 'draft'").pluck().get()).toBe(version);
  const before = history(peer).map(({ version_id, parent_version_id }) => ({ version_id, parent_version_id }));
  await releaseLocalEditBase(peer.port, 'draft', 'topic');
  expect(history(peer).find(row => row.version_id === version)?.body_text).toBeNull();
  expect(history(peer).map(({ version_id, parent_version_id }) => ({ version_id, parent_version_id }))).toEqual(before);
});

it('keeps unresolved conflict identity through permanent node deletion', () => {
  const peer = createPeer('local');
  const version = edit(peer, 'body');
  peer.driver.execute(`INSERT INTO node_sync_conflicts
    (conflict_version_id, object_id, snapshot_json, detected_at) VALUES (?, 'topic', '{}', 'now')`, [version]);
  expectDeletion(peer, version);
  expect(peer.db.prepare('SELECT conflict_version_id, snapshot_json FROM node_sync_conflicts').all())
    .toEqual([{ conflict_version_id: version, snapshot_json: '{}' }]);
});

it('keeps a surviving anchor parent identity through permanent node deletion', () => {
  const peer = createPeer('local');
  const version = edit(peer, 'body');
  peer.driver.execute(`INSERT INTO nodes (id, title, kind, content, anchor_source_version_id, created_at, updated_at)
    VALUES ('anchor', 'Anchor', 'item', '', ?, 'now', 'now')`, [version]);
  expectDeletion(peer, version);
  expect(peer.db.prepare("SELECT anchor_source_version_id FROM nodes WHERE id = 'anchor'").pluck().get()).toBe(version);
});
