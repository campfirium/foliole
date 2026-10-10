// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it } from 'vitest';

import { loadCurrentSyncNodeRecord } from '../../lib/core/sync/syncNodeGraph.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { assertPersisted, closeLibraries, createPeer, edit, history, joinPeers, startLibraries, sync,
  type Peer } from './syncEmptyLibraryTestSupport.js';

beforeEach(startLibraries);
afterEach(closeLibraries);

function restart(peer: Peer) {
  peer.db.close();
  peer.db = new Database(peer.file);
  peer.db.pragma('foreign_keys = ON');
  peer.driver = createBetterSqlite3Driver(peer.db);
  peer.port = createBetterSqliteDbPort(peer.db);
}

function assertBody(peer: Peer, body: string) {
  const stored = peer.db.prepare('SELECT body_text FROM node_sync_versions WHERE body_text = ?')
    .pluck().get(body);
  expect(stored).toBe(body);
}

it('preserves offline bases and branches, merges across three production libraries and restarts durably', async () => {
  const a = createPeer('a');
  const b = createPeer('b');
  const c = createPeer('c');
  joinPeers(a, b, c);
  const suffix = 'Stable paragraph.\n'.repeat(100);
  const baseBody = `left\nright\n${suffix}`;
  const onlineBody = `left-online\nright\n${suffix}`;
  const offlineBody = `left\nright-offline\n${suffix}`;

  const base = edit(a, baseBody);
  await sync(a, c);
  const online = edit(a, onlineBody);
  await sync(a, b);
  assertBody(a, baseBody);
  expect(history(b).find((row) => row.version_id === base)?.body_text).toBe(baseBody);
  const offline = edit(c, offlineBody);
  assertBody(c, baseBody);
  assertBody(c, offlineBody);
  for (const peer of [a, b, c]) restart(peer);
  assertBody(a, baseBody);
  assertBody(c, offlineBody);
  await sync(b, c);
  const selected = (await loadCurrentSyncNodeRecord(c.port, 'topic'))!;
  const mergedBody = selected.body_text!;
  expect(new Set([mergedBody, ...(selected.alternative_bodies ?? []).map((entry) => entry.text)]))
    .toEqual(new Set([onlineBody, offlineBody]));
  assertPersisted(c, mergedBody);
  await sync(c, b);
  await sync(b, a);
  await sync(a, c);
  await sync(a, b);
  await sync(c, a);
  await sync(b, c);
  for (const peer of [a, b, c]) {
    const before = history(peer);
    restart(peer);
    assertPersisted(peer, mergedBody);
    assertBody(peer, mergedBody);
    expect(history(peer)).toEqual(before);
    expect(before.map((row) => row.version_id)).toEqual(expect.arrayContaining([base, online, offline]));
    expect(before.find((row) => row.version_id === online)?.parent_version_id).toBe(base);
    expect(before.find((row) => row.version_id === offline)?.parent_version_id).toBe(base);
    for (const row of before.filter((version) => version.body_text === null)) {
      expect(JSON.parse(row.snapshot_json)).toMatchObject({ content: null, body_deleted: true });
    }
  }
});
