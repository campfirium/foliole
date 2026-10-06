// @vitest-environment node
import { promises as fs } from 'node:fs';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { computeSyncContentHash, upsertSyncObjectState } from '../../lib/core/database/syncState.js';
import { buildCanonicalViewStateSyncPayload } from '../../lib/core/sync/canonicalPrivateStatePayload.js';
import { createBetterSqlite3Driver } from '../database/betterSqlite3Driver.js';

import { readFixtureInventory, reconnectFixturePeer } from './desktopFramedSyncPublicationRecovery.testSupport.js';
import { createDesktopFramedSyncTwoProcessFixture } from './desktopFramedSyncTwoProcess.testSupport.js';

function privateState(file: string, nodeId: string, scroll: number) {
  const db = new Database(file);
  try {
    const stored = db.prepare("SELECT value FROM settings WHERE key = 'host_name'").pluck().get();
    if (typeof stored !== 'string') throw new Error('original_host_missing');
    const host: unknown = JSON.parse(stored);
    if (typeof host !== 'string') throw new Error('original_host_invalid');
    db.transaction(() => {
      db.prepare("INSERT OR REPLACE INTO workspace_meta VALUES ('active_node_id', ?, ?)").run(nodeId, '2026-10-06');
      db.prepare(`INSERT INTO node_view_state VALUES (?, ?, ?, 2, 4, 'user-scroll', ?)`)
        .run(nodeId, host, scroll, '2026-10-06');
      for (const view of [{ key: 'active_node', active_node_id: nodeId },
        { key: `node:${nodeId}`, node_id: nodeId, scroll_top: scroll, selection_from: 2, selection_to: 4 }]) {
        const payload = buildCanonicalViewStateSyncPayload({ ...view, form_factor: 'desktop',
          host_name: host, platform: 'windows', scope: 'session_resume' });
        upsertSyncObjectState(createBetterSqlite3Driver(db), { objectType: 'view_state',
          objectId: `session_resume:windows:desktop:${host}:${view.key}`,
          contentHash: computeSyncContentHash('view_state', payload), lastModifiedByHostName: host,
          syncDirty: true, updatedAt: '2026-10-06' });
      }
    })();
  } finally { db.close(); }
}

function readPrivate(file: string) {
  const db = new Database(file, { readonly: true });
  try {
    return { active: db.prepare("SELECT value FROM workspace_meta WHERE key = 'active_node_id'").pluck().get(),
      views: db.prepare('SELECT * FROM node_view_state ORDER BY node_id, host_name').all(),
      identities: db.prepare("SELECT * FROM sync_object_state WHERE object_type = 'view_state' ORDER BY object_id").all() };
  } finally { db.close(); }
}

it('keeps each peer private UI state and identity across a complete business round and process restart', async () => {
  const fixture = await createDesktopFramedSyncTwoProcessFixture();
  try {
    await fixture.left.seed({ content: 'Left original body', nodeId: 'left-topic', title: 'Left' });
    await fixture.left.seed({ content: 'Right original body', nodeId: 'right-topic', title: 'Right' });
    expect(await reconnectFixturePeer(fixture.left, fixture.rightSnapshot)).toMatchObject({ complete: true });
    privateState(fixture.leftSnapshot.databasePath, 'left-topic', 111);
    privateState(fixture.rightSnapshot.databasePath, 'right-topic', 999);
    await fixture.left.seed({ content: 'Updated shared body', nodeId: 'left-topic', title: 'Left' });
    const before = [readPrivate(fixture.leftSnapshot.databasePath), readPrivate(fixture.rightSnapshot.databasePath)];
    const first = await reconnectFixturePeer(fixture.left, fixture.rightSnapshot);
    expect(first).toEqual(expect.objectContaining({ transferred: expect.any(Number) }));
    expect(await reconnectFixturePeer(fixture.left, fixture.rightSnapshot)).toMatchObject({ complete: true });
    expect(await readFixtureInventory(fixture.right)).toEqual(await readFixtureInventory(fixture.left));
    expect([readPrivate(fixture.leftSnapshot.databasePath), readPrivate(fixture.rightSnapshot.databasePath)]).toEqual(before);
    await fixture.restartLeft();
    const restarted = await fixture.restartRight();
    expect([readPrivate(fixture.leftSnapshot.databasePath), readPrivate(fixture.rightSnapshot.databasePath)]).toEqual(before);
    expect(await reconnectFixturePeer(fixture.left, restarted.snapshot)).toMatchObject({ complete: true });
  } finally {
    await Promise.allSettled([fixture.left.close(), fixture.right.close()]);
    await fs.rm(fixture.root, { force: true, recursive: true });
  }
}, 60_000);
