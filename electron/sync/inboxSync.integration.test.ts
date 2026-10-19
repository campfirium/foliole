// @vitest-environment node
import { promises as fs } from 'node:fs';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { currentParentOrderHash, currentParentOrderPayload } from '../../lib/core/sync/currentParentOrder.js';
import { hashText } from '../../lib/core/sync/syncNodeResolution.js';
import { applySyncObjectInTransaction } from '../../lib/core/sync/syncObjectApplyExecutor.js';
import { createBetterSqlite3Driver } from '../database/betterSqlite3Driver.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { flushNodeSyncVersionWithDriver } from '../database/nodeSyncVersionFromDriver.js';

import { createDesktopFramedSyncTwoProcessFixture } from './desktopFramedSyncTwoProcess.testSupport.js';

const inbox = 'special-inbox';
const at = '2026-10-19T06:00:00.000Z';

async function changeInbox(databasePath: string, counter: number, children: string[], openedAt: string) {
  const sqlite = new Database(databasePath);
  const db = createBetterSqliteDbPort(sqlite);
  try {
    const sources = [{ authorId: 'inbox-writer', counter: counter + 100, childIds: children }];
    await applySyncObjectInTransaction(db, {
      object_type: 'parent_child_order', object_id: inbox,
      payload_json: JSON.stringify(currentParentOrderPayload(inbox, sources)),
      content_hash: currentParentOrderHash(inbox, sources), updated_at: openedAt, deleted_at: null
    });
    const payload = JSON.stringify({ node_id: inbox, last_opened_at: openedAt });
    await applySyncObjectInTransaction(db, { object_type: 'node_open_state', object_id: inbox,
      payload_json: payload, content_hash: hashText(payload), updated_at: openedAt, deleted_at: null });
    sqlite.prepare('UPDATE nodes SET priority = ?, updated_at = ?, sync_dirty = 1 WHERE id = ?')
      .run(counter, openedAt, inbox);
    flushNodeSyncVersionWithDriver(createBetterSqlite3Driver(sqlite), inbox, 'inbox-writer', openedAt);
  } finally { sqlite.close(); }
}

function assertInbox(databasePath: string, priority: number, children: string[], openedAt: string) {
  const db = new Database(databasePath);
  try {
    expect(db.prepare('SELECT kind, priority, deleted_at FROM nodes WHERE id = ?').get(inbox))
      .toEqual({ kind: 'folder', priority, deleted_at: null });
    expect(db.prepare('SELECT child_ids_json FROM parent_child_order WHERE parent_id = ?').pluck().get(inbox))
      .toBe(JSON.stringify(children));
    expect(db.prepare('SELECT last_opened_at FROM node_open_state WHERE node_id = ?').pluck().get(inbox)).toBe(openedAt);
    expect(db.prepare('SELECT COUNT(*) FROM nodes WHERE parent_id = ?').pluck().get(inbox)).toBe(2);
  } finally { db.close(); }
}

it('syncs Inbox attributes, ordering and opening time in both directions and retains them after restart', async () => {
  const fixture = await createDesktopFramedSyncTwoProcessFixture(undefined, true, true);
  const { leftSnapshot: a, rightSnapshot: b } = fixture;
  const round = () => fixture.left.invoke('round', { input: { kind: 'request_reconcile', peerOrigin: b.origin,
    peer: { deviceId: b.deviceId, libraryEpoch: `${b.deviceId}-epoch` } } });
  try {
    for (const nodeId of ['inbox-a', 'inbox-b']) {
      await fixture.left.seed({ nodeId, parentNodeId: inbox, content: nodeId, title: nodeId });
    }
    await changeInbox(a.databasePath, 1, ['inbox-b', 'inbox-a'], at);
    expect(await round()).toMatchObject({ complete: true });
    assertInbox(b.databasePath, 1, ['inbox-b', 'inbox-a'], at);
    const later = '2026-10-19T07:00:00.000Z';
    await changeInbox(b.databasePath, 2, ['inbox-a', 'inbox-b'], later);
    expect(await round()).toMatchObject({ complete: true });
    for (const device of [a, b]) assertInbox(device.databasePath, 2, ['inbox-a', 'inbox-b'], later);
    await fixture.restartLeft();
    await fixture.restartRight();
    for (const device of [a, b]) assertInbox(device.databasePath, 2, ['inbox-a', 'inbox-b'], later);
  } finally {
    await Promise.allSettled([fixture.left.close(), fixture.right.close()]);
    await fs.rm(fixture.root, { force: true, recursive: true });
  }
}, 60_000);
