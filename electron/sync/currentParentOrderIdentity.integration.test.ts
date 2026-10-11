// @vitest-environment node
import { promises as fs } from 'node:fs';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { reconnectFixturePeer } from './desktopFramedSyncPublicationRecovery.testSupport.js';
import { createDesktopFramedSyncTwoProcessFixture } from './desktopFramedSyncTwoProcess.testSupport.js';

function state(file: string) {
  const db = new Database(file, { readonly: true });
  try { return { writer: db.prepare('SELECT author_id FROM parent_order_writer').pluck().get(),
    sources: db.prepare('SELECT author_id, counter, child_ids_json FROM parent_order_sources ORDER BY parent_id, author_id').all(),
    order: db.prepare("SELECT child_ids_json FROM parent_child_order WHERE parent_id = 'parent-child-order:root'").pluck().get() }; }
  finally { db.close(); }
}

it.each(['clone', 'restore'] as const)('rejoins after the first offline %s edit without reusing an author', async mode => {
  const fixture = await createDesktopFramedSyncTwoProcessFixture();
  try {
    for (const nodeId of ['a', 'b', 'c']) await fixture.left.seed({ nodeId, content: 'Body', title: nodeId });
    await reconnectFixturePeer(fixture.left, fixture.rightSnapshot);
    const original = state(fixture.leftSnapshot.databasePath);
    if (mode === 'clone') {
      await Promise.all([fixture.left.close(), fixture.right.close()]);
      await fs.copyFile(fixture.leftSnapshot.databasePath, fixture.rightSnapshot.databasePath);
      const clone = new Database(fixture.rightSnapshot.databasePath);
      clone.prepare("UPDATE sync_group_local_state SET local_device_identity_key = 'desktop-b'").run();
      clone.close();
      await fixture.restartLeft();
      await fixture.restartRight();
    }
    const peer = mode === 'clone' ? fixture.right : fixture.left;
    const file = mode === 'clone' ? fixture.rightSnapshot.databasePath : fixture.leftSnapshot.databasePath;
    const group = await peer.invoke('standalone_edit');
    if (mode === 'restore') await peer.invoke('restore_local_order');
    await peer.invoke('reorder', { nodeIds: ['c', 'b', 'a'] });
    expect(state(file).writer).not.toBe(original.writer);
    const writer = state(file).writer;
    await peer.invoke('rejoin', group as Record<string, unknown>);
    const left = (await fixture.restartLeft()).snapshot;
    const right = (await fixture.restartRight()).snapshot;
    await reconnectFixturePeer(fixture.left, right);
    await reconnectFixturePeer(fixture.right, left);
    expect(state(file).writer).toBe(writer);
    expect(state(left.databasePath).sources).toEqual(state(right.databasePath).sources);
    expect(state(left.databasePath).order).toBe(state(right.databasePath).order);
    expect(JSON.parse(String(state(file).order)).filter((id: string) => ['a', 'b', 'c'].includes(id)))
      .toEqual(['c', 'b', 'a']);
  } finally {
    await Promise.allSettled([fixture.left.close(), fixture.right.close()]);
    await fs.rm(fixture.root, { force: true, recursive: true });
  }
}, 60_000);
