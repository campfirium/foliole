// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { loadNodeBodyResolution } from '../../lib/core/database/nodeBodyResolution.js';
import { readFramedSyncInventory } from '../../lib/core/sync/framedSyncInventoryRead.js';
import { loadCurrentSyncNodeRecord } from '../../lib/core/sync/syncNodeGraph.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { closeLibraries, createPeer, edit, joinPeers, startLibraries, type Peer } from './syncLibrary.testSupport.js';
import { syncRequestLibrary as sync } from './syncRequestLibrary.testSupport.js';

beforeEach(async () => {
  await startLibraries();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-07T00:00:00.000Z'));
});
afterEach(async () => { await closeLibraries(); vi.useRealTimers(); });

const current = async (peer: Peer) => (await loadCurrentSyncNodeRecord(peer.port, 'topic'))!;
const alternatives = async (peer: Peer) => ((await current(peer)).alternative_bodies ?? []).map(entry => entry.text).sort();

async function fork(equal = false, missingOnBoth = true) {
  const left = createPeer('left');
  const right = createPeer('right');
  const fresh = createPeer('fresh');
  joinPeers(left, right, fresh);
  const a = edit(left, 'Original\nx=0\n');
  await sync(left, right);
  await sync(right, left);
  edit(left, 'Left intermediate\nx=0\n');
  edit(right, 'Right intermediate\nx=1\n');
  const b = edit(left, equal ? 'Shared body' : 'Left final\nx=0\n');
  const c = edit(right, equal ? 'Shared body' : 'Original\nx=1\n');
  for (const peer of missingOnBoth ? [left, right] : [left]) {
    // Model an existing historical gap only in these disposable databases.
    peer.db.prepare('DELETE FROM node_sync_versions WHERE version_id = ?').run(a);
  }
  return { left, right, fresh, a, b, c };
}

function assertReopened(peer: Peer, body: string, version: string, missing: string[]) {
  const db = new Database(peer.file, { readonly: true });
  try {
    expect(loadNodeBodyResolution(createBetterSqlite3Driver(db), 'topic'))
      .toMatchObject({ status: 'resolved', content: body });
    expect(db.prepare("SELECT current_version_id FROM nodes WHERE id = 'topic'").pluck().get()).toBe(version);
    const gaps = db.prepare(`SELECT DISTINCT p.parent_version_id FROM node_sync_version_parents p
      LEFT JOIN node_sync_versions v ON v.version_id = p.parent_version_id WHERE v.version_id IS NULL`)
      .pluck().all();
    expect(gaps.sort()).toEqual([...missing].sort());
    expect(db.prepare("SELECT count(*) FROM nodes WHERE id LIKE 'topic%'").pluck().get()).toBe(1);
  } finally { db.close(); }
}

function originals(peer: Peer) {
  const db = new Database(peer.file, { readonly: true });
  try {
    return ['nodes', 'node_sync_versions', 'node_sync_version_parents', 'node_text_alternatives',
      'sync_object_state'].map(table => db.prepare(`SELECT * FROM ${table}
        ${table === 'sync_object_state' ? "WHERE object_type = 'node'" : ''} ORDER BY 1`).all());
  } finally { db.close(); }
}

it.each([false, true])('rejects branches with a missing ancestor without losing either available body (equal=%s)', async equal => {
  const { left, right, fresh } = await fork(equal);
  const before = [left, right, fresh].map(originals);
  for (const [source, target] of [[left, right], [right, left], [left, fresh]] as const) {
    await expect(sync(source, target)).rejects.toThrow(/missing_parent|version_missing/);
    expect([left, right, fresh].map(originals)).toEqual(before);
    await expect(sync(source, target)).rejects.toThrow(/missing_parent|version_missing/);
    expect([left, right, fresh].map(originals)).toEqual(before);
  }
  expect((await current(left)).body_text).toBe(equal ? 'Shared body' : 'Left final\nx=0\n');
  expect((await current(right)).body_text).toBe(equal ? 'Shared body' : 'Original\nx=1\n');
});

it('restores peer base identity and preserves each complete divergent body', async () => {
  const { left, right, a, c } = await fork(false, false);
  await sync(right, left);
  const merged = await current(left);
  expect(new Set([merged.body_text, ...await alternatives(left)]))
    .toEqual(new Set(['Left final\nx=0\n', 'Original\nx=1\n']));
  expect(merged.parent_version_ids).toContain(c);
  expect(await alternatives(left)).toEqual(['Original\nx=1\n']);
  await sync(left, right);
  expect((await current(right)).version_id).toBe(merged.version_id);
  expect((await current(right)).body_text).toBe(merged.body_text);
  for (const peer of [left, right]) {
    expect(peer.db.prepare('SELECT version_id FROM node_sync_versions WHERE version_id = ?').pluck().get(a))
      .toBe(a);
    assertReopened(peer, merged.body_text!, merged.version_id!, []);
  }
});


it.each(['identity', 'identity-with-history', 'body'])('rejects an unavailable current version %s without changing receiver node facts', async unavailable => {
  const source = createPeer('source');
  const target = createPeer('target');
  joinPeers(source, target);
  edit(source, 'Available original body');
  if (unavailable === 'identity-with-history') edit(source, 'New current body');
  if (unavailable !== 'body') source.db.prepare("DELETE FROM node_sync_versions WHERE version_id = (SELECT current_version_id FROM nodes WHERE id = 'topic')").run();
  else source.db.prepare(`UPDATE node_sync_versions SET body_text = NULL,
    snapshot_json = json_set(snapshot_json, '$.content', NULL)
    WHERE version_id = (SELECT current_version_id FROM nodes WHERE id = 'topic')`).run();
  const before = originals(target);
  expect((await readFramedSyncInventory(source.port)).find(entry => entry.globalId === 'topic')).toMatchObject({ unready: true });
  await expect(sync(source, target)).rejects.toThrow('framed_sync_source_changed');
  expect(originals(target)).toEqual(before);
});
