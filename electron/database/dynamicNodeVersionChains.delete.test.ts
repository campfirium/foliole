// @vitest-environment node
import { afterEach, beforeEach, expect, it } from 'vitest';

import { retainLocalEditBase } from '../../lib/core/sync/nodeVersionLocalEditHold.js';

import { permanentlyDelete } from './dynamicNodeVersionChains.delete.testSupport.js';
import { buildPack, closeLibraries, createPeer, edit, history, joinPeers, startLibraries,
  type Peer } from './syncEmptyLibraryTestSupport.js';

beforeEach(startLibraries);
afterEach(closeLibraries);

function expectDeletion(peer: Peer, previous: string, retained: boolean) {
  const tombstone = permanentlyDelete(peer);
  const versions = history(peer);
  expect(tombstone.version_id).not.toBe(previous);
  expect(tombstone.parent_version_id).toBe(retained ? previous : null);
  expect(JSON.parse(tombstone.snapshot_json)).toMatchObject({ id: 'topic', deleted_at: '2026-10-01T00:00:00.000Z' });
  expect(versions.find(row => row.version_id === tombstone.version_id)?.body_text).toBe('body');
  expect(versions.some(row => row.version_id === previous)).toBe(retained);
  if (retained) expect(versions.find(row => row.version_id === previous)?.body_text).toBe('body');
  expect(peer.db.prepare("SELECT id FROM nodes WHERE id = 'topic'").get()).toBeUndefined();
  expect(peer.db.prepare("SELECT current_version_id, deleted_at FROM sync_object_state WHERE object_type = 'node' AND object_id = 'topic'").get())
    .toEqual({ current_version_id: tombstone.version_id, deleted_at: '2026-10-01T00:00:00.000Z' });
}

it('retires an unheld pre-delete version outside a group and keeps the complete deletion fact', () => {
  const peer = createPeer('local');
  expectDeletion(peer, edit(peer, 'body'), false);
});

it('does not treat group membership alone as a concrete send', () => {
  const peer = createPeer('local');
  joinPeers(peer, createPeer('remote'));
  peer.db.exec("UPDATE sync_group_devices SET joined_at = '2025-01-01T00:00:00.000Z'");
  const version = edit(peer, 'body');
  expectDeletion(peer, version, false);
});

it('keeps an actual frozen outbound parent complete through permanent node deletion', async () => {
  const peer = createPeer('local');
  const remote = createPeer('remote');
  joinPeers(peer, remote);
  const version = edit(peer, 'body');
  await buildPack(peer, remote);
  expectDeletion(peer, version, true);
});

it('keeps an active editor base complete through permanent node deletion', async () => {
  const peer = createPeer('local');
  const version = edit(peer, 'body');
  await retainLocalEditBase(peer.port, { holdId: 'draft', nodeId: 'topic', versionId: version });
  expectDeletion(peer, version, true);
});

it('keeps an unresolved conflict parent complete through permanent node deletion', () => {
  const peer = createPeer('local');
  const version = edit(peer, 'body');
  peer.driver.execute(`INSERT INTO node_sync_conflicts
    (conflict_version_id, object_id, snapshot_json, detected_at) VALUES (?, 'topic', '{}', 'now')`, [version]);
  expectDeletion(peer, version, true);
});

it('keeps a surviving anchor parent complete through permanent node deletion', () => {
  const peer = createPeer('local');
  const version = edit(peer, 'body');
  peer.driver.execute(`INSERT INTO nodes (id, title, kind, content, anchor_source_version_id, created_at, updated_at)
    VALUES ('anchor', 'Anchor', 'item', '', ?, 'now', 'now')`, [version]);
  expectDeletion(peer, version, true);
});
