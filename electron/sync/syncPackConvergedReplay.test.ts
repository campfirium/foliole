// @vitest-environment node
import { afterEach, beforeEach, expect, it } from 'vitest';

import { loadCurrentSyncNodeRecord } from '../../lib/core/sync/syncNodeGraph.js';
import { buildResolutionRecord } from '../../lib/core/sync/syncNodeResolution.js';
import { describeVersionFact, probeSyncPackFactPresence } from '../../lib/core/sync/syncPackFactPresence.js';
import { applySyncPackNodeVersionsWithDbPort } from '../../lib/core/sync/syncPackNodeVersionApplyExecutor.js';
import type { NativeSyncNodeRecord } from '../../lib/platform/nativeSyncContract.js';
import { closeLibraries, createPeer, edit, startLibraries, type Peer } from '../database/syncEmptyLibraryTestSupport.js';

beforeEach(startLibraries);
afterEach(closeLibraries);

function store(peer: Peer, record: NativeSyncNodeRecord, parent: string | null) {
  peer.db.prepare(`INSERT OR REPLACE INTO node_sync_versions
    (version_id, object_id, parent_version_id, host_name, created_at, content_hash, body_text, snapshot_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(record.version_id, record.object_id, parent,
    record.host_name, record.version_created_at, record.content_hash, record.body_text, JSON.stringify(record.snapshot));
  if (parent) peer.db.prepare('INSERT OR REPLACE INTO node_sync_version_parents VALUES (?, ?, 0)')
    .run(record.version_id, parent);
}

async function setup() {
  const left = createPeer('left');
  const right = createPeer('right');
  edit(left, 'Base');
  const base = (await loadCurrentSyncNodeRecord(left.port, 'topic'))!;
  edit(left, 'Left branch');
  const a = (await loadCurrentSyncNodeRecord(left.port, 'topic'))!;
  edit(right, 'Right branch');
  const b = (await loadCurrentSyncNodeRecord(right.port, 'topic'))!;
  const final = buildResolutionRecord([
    { ...a, version_id: 'retired-left', version_created_at: '2026-10-01T00:00:00.000Z' },
    { ...b, version_id: 'retired-right', version_created_at: '2026-10-01T00:00:01.000Z' }
  ], a, 'Converged');
  for (const [peer, branch] of [[left, a], [right, b]] as const) {
    store(peer, base, null);
    store(peer, branch, base.version_id!);
    store(peer, final, branch.version_id!);
    peer.db.prepare("UPDATE nodes SET current_version_id = ? WHERE id = 'topic'").run(final.version_id);
  }
  left.db.prepare('ATTACH DATABASE ? AS inc').run(right.file);
  const facts = right.db.prepare(`SELECT *, json_remove(snapshot_json, '$.content') AS snapshot_metadata
    FROM node_sync_versions`).all() as Parameters<typeof describeVersionFact>[0][];
  const claims = await probeSyncPackFactPresence(left.port, { versions: facts.map(describeVersionFact), parents: [], reviews: [] });
  return { left, right, base, a, b, final, claims };
}

it.each([false, true])('replays a verified converged head without importing a different contracted history (omitted=%s)', async omitted => {
  const { left, right, final, claims } = await setup();
  const before = left.db.prepare('SELECT * FROM node_sync_version_parents WHERE version_id = ?').all(final.version_id);
  if (omitted) {
    right.db.pragma('foreign_keys = OFF');
    right.db.prepare('DELETE FROM node_sync_versions WHERE version_id = ?').run(final.version_id);
  }
  await applySyncPackNodeVersionsWithDbPort(left.port, { verifiedVersionIds: omitted ? claims.versions : [] });
  expect(left.db.prepare('SELECT * FROM node_sync_version_parents WHERE version_id = ?').all(final.version_id)).toEqual(before);
  expect(left.db.prepare('SELECT body_text FROM node_sync_versions WHERE version_id = ?').pluck().get(final.version_id))
    .toBe('Converged');
});

it.each(['unverified', 'different-head', 'missing-base', 'missing-body', 'wrong-object', 'changed-snapshot', 'cycle'])(
  'rejects insufficient replay evidence without changing retained history: %s', async mutation => {
    const { left, right, base, b, final } = await setup();
    const before = left.db.prepare('SELECT * FROM node_sync_version_parents').all();
    if (mutation === 'unverified') {
      right.db.pragma('foreign_keys = OFF');
      right.db.prepare('DELETE FROM node_sync_versions WHERE version_id = ?').run(final.version_id);
    }
    if (mutation === 'different-head') right.db.prepare("UPDATE nodes SET current_version_id = ? WHERE id = 'topic'").run(b.version_id);
    if (mutation === 'missing-base') {
      right.db.prepare('DELETE FROM node_sync_version_parents WHERE version_id = ?').run(b.version_id);
      right.db.prepare('UPDATE node_sync_versions SET parent_version_id = NULL WHERE version_id = ?').run(b.version_id);
    }
    if (mutation === 'missing-body') right.db.prepare(`UPDATE node_sync_versions SET body_text = NULL,
      snapshot_json = json_set(snapshot_json, '$.content', NULL) WHERE version_id = ?`).run(b.version_id);
    if (mutation === 'wrong-object') right.db.prepare("UPDATE node_sync_versions SET object_id = 'other' WHERE version_id = ?").run(b.version_id);
    if (mutation === 'changed-snapshot') right.db.prepare(`UPDATE node_sync_versions SET
      snapshot_json = json_set(snapshot_json, '$.title', 'Changed') WHERE version_id = ?`).run(final.version_id);
    if (mutation === 'cycle') right.db.prepare('UPDATE node_sync_version_parents SET parent_version_id = ? WHERE version_id = ?')
      .run(final.version_id, b.version_id);
    await expect(applySyncPackNodeVersionsWithDbPort(left.port)).rejects.toThrow(/sync_pack_node_/);
    expect(left.db.prepare('SELECT * FROM node_sync_version_parents').all()).toEqual(before);
    expect(left.db.prepare('SELECT body_text FROM node_sync_versions WHERE version_id = ?').pluck().get(base.version_id)).toBe('Base');
  }
);
