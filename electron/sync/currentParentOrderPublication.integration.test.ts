// @vitest-environment node
import { promises as fs } from 'node:fs';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { currentParentOrderHash, currentParentOrderPayload } from '../../lib/core/sync/currentParentOrder.js';
import { applyCurrentParentOrderRecord } from '../../lib/core/sync/currentParentOrderStore.js';
import { compareFramedSyncInventories } from '../../lib/core/sync/framedSyncInventory.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';

import { readFixtureInventory } from './desktopFramedSyncPublicationRecovery.testSupport.js';
import { createDesktopFramedSyncTwoProcessFixture, type DesktopFramedSyncFixtureSnapshot }
  from './desktopFramedSyncTwoProcess.testSupport.js';

function evidence(file: string) {
  const db = new Database(file, { readonly: true });
  try {
    return {
      writer: db.prepare('SELECT author_id FROM parent_order_writer').pluck().get(),
      sources: db.prepare('SELECT * FROM parent_order_sources ORDER BY parent_id, author_id').all(),
      order: JSON.parse(db.prepare('SELECT child_ids_json FROM parent_child_order WHERE parent_id = ?')
        .pluck().get('parent-child-order:root') as string) as string[]
    };
  } finally { db.close(); }
}

function roundArgs(peer: DesktopFramedSyncFixtureSnapshot) {
  return { input: { kind: 'request_reconcile', peer: { deviceId: peer.deviceId,
    libraryEpoch: `${peer.deviceId}-epoch` }, peerOrigin: peer.origin } };
}

it.each(['left', 'right'] as const)('keeps the %s writer through offline group leave and rejoin', { meta: { calibratedMs: 60_000 } }, async (side) => {
  const fixture = await createDesktopFramedSyncTwoProcessFixture(undefined, true, true);
  try {
    for (const nodeId of ['a', 'b', 'c']) await fixture.left.seed({ nodeId, content: 'Body', title: nodeId });
    await fixture.left.invoke('round', roundArgs(fixture.rightSnapshot));
    const peer = fixture[side];
    const snapshot = side === 'left' ? fixture.leftSnapshot : fixture.rightSnapshot;
    const other = side === 'left' ? fixture.rightSnapshot : fixture.leftSnapshot;
    const before = evidence(snapshot.databasePath);
    const group = await peer.invoke('standalone_edit');
    await peer.seed({ nodeId: 'd', content: 'Body', title: 'd' });
    await peer.invoke('reorder', { nodeIds: ['c', 'a', 'b', 'd'] });
    await peer.invoke('rejoin', group as Record<string, unknown>);
    await peer.invoke('round', roundArgs(other));
    expect(evidence(snapshot.databasePath).writer).toBe(before.writer);
    expect(evidence(other.databasePath).order).toEqual(evidence(snapshot.databasePath).order);
    expect(evidence(other.databasePath).order.filter(id => ['a', 'b', 'c', 'd'].includes(id)))
      .toEqual(['c', 'a', 'b', 'd']);
  } finally {
    await Promise.allSettled([fixture.left.close(), fixture.right.close()]);
    await fs.rm(fixture.root, { force: true, recursive: true });
  }
});

it('delivers the latest saved order after offline edits, collection and restart', { meta: { calibratedMs: 60_000 } }, async () => {
  const fixture = await createDesktopFramedSyncTwoProcessFixture(undefined, true, true);
  try {
    for (const nodeId of ['a', 'b', 'c']) await fixture.left.seed({ nodeId, content: 'Body', title: nodeId });
    await fixture.left.invoke('round', roundArgs(fixture.rightSnapshot));
    await fixture.left.invoke('reorder', { nodeIds: ['b', 'a', 'c'] });
    const [difference] = compareFramedSyncInventories({ local: await readFixtureInventory(fixture.left),
      remote: await readFixtureInventory(fixture.right) }).filter(value => value.objectType === 'parent_child_order');
    expect(difference).toBeDefined();
    await fixture.left.invoke('reorder', { nodeIds: ['c', 'b', 'a'] });
    await fixture.left.invoke('collect_content');
    const saved = evidence(fixture.leftSnapshot.databasePath);
    const restarted = await fixture.restartLeft();
    expect(evidence(restarted.snapshot.databasePath)).toEqual(saved);
    await restarted.process.invoke('round', roundArgs(fixture.rightSnapshot));
    const final = evidence(restarted.snapshot.databasePath);
    expect(final.order.filter(id => ['a', 'b', 'c'].includes(id))).toEqual(['c', 'b', 'a']);
    expect(evidence(fixture.rightSnapshot.databasePath).sources).toEqual(final.sources);
    expect(evidence(fixture.rightSnapshot.databasePath).order).toEqual(final.order);
    await restarted.process.invoke('round', roundArgs(fixture.rightSnapshot));
    expect(evidence(restarted.snapshot.databasePath).sources).toEqual(final.sources);
  } finally {
    await Promise.allSettled([fixture.left.close(), fixture.right.close()]);
    await fs.rm(fixture.root, { force: true, recursive: true });
  }
});

it('propagates a changed source set even when both rendered arrays already match', { meta: { calibratedMs: 60_000 } }, async () => {
  const fixture = await createDesktopFramedSyncTwoProcessFixture(undefined, true, true);
  try {
    for (const nodeId of ['a', 'b']) await fixture.left.seed({ nodeId, content: 'Body', title: nodeId });
    await fixture.left.invoke('round', roundArgs(fixture.rightSnapshot));
    const before = evidence(fixture.leftSnapshot.databasePath);
    const parentId = 'parent-child-order:root';
    const source = [{ authorId: 'offline-source', counter: 100, childIds: before.order }];
    const db = new Database(fixture.leftSnapshot.databasePath);
    try {
      await applyCurrentParentOrderRecord(createBetterSqliteDbPort(db), {
        object_type: 'parent_child_order', object_id: parentId, deleted_at: null,
        payload_json: JSON.stringify(currentParentOrderPayload(parentId, source)),
        content_hash: currentParentOrderHash(parentId, source), updated_at: '2026-10-11'
      });
    } finally { db.close(); }
    expect(evidence(fixture.leftSnapshot.databasePath).order).toEqual(before.order);
    await fixture.left.invoke('round', roundArgs(fixture.rightSnapshot));
    const receiver = (await fixture.restartRight()).snapshot;
    const after = evidence(receiver.databasePath);
    expect(after.order).toEqual(before.order);
    expect(after.sources).toContainEqual(expect.objectContaining({ author_id: 'offline-source', counter: 100 }));
    expect(after.sources).toEqual(evidence(fixture.leftSnapshot.databasePath).sources);
  } finally {
    await Promise.allSettled([fixture.left.close(), fixture.right.close()]);
    await fs.rm(fixture.root, { force: true, recursive: true });
  }
});

it('reprojects a renamed unconstrained addition on both peers and after restart without new order sources', { meta: { calibratedMs: 60_000 } }, async () => {
  const fixture = await createDesktopFramedSyncTwoProcessFixture(undefined, true, true);
  try {
    for (const nodeId of ['a', 'b']) await fixture.left.seed({ nodeId, content: 'Body', title: nodeId });
    await fixture.left.invoke('round', roundArgs(fixture.rightSnapshot));
    await fixture.left.seed({ nodeId: 'x', content: 'Body x', title: 'Topic 2' });
    await fixture.left.invoke('reorder', { nodeIds: ['a', 'x', 'b'] });
    await fixture.right.seed({ nodeId: 'y', content: 'Body y', title: 'Topic 10' });
    await fixture.right.invoke('reorder', { nodeIds: ['a', 'y', 'b'] });
    await fixture.left.invoke('round', roundArgs(fixture.rightSnapshot));
    const before = evidence(fixture.leftSnapshot.databasePath);
    expect(before.order.filter(id => ['a', 'b', 'x', 'y'].includes(id))).toEqual(['a', 'x', 'y', 'b']);
    await fixture.left.seed({ nodeId: 'x', content: 'Body x', title: 'Topic 20' });
    expect(await fixture.left.invoke('round', roundArgs(fixture.rightSnapshot))).toMatchObject({ complete: true });
    const left = (await fixture.restartLeft()).snapshot;
    const right = (await fixture.restartRight()).snapshot;
    for (const peer of [left, right]) {
      const current = evidence(peer.databasePath);
      expect(current.order.filter(id => ['a', 'b', 'x', 'y'].includes(id))).toEqual(['a', 'y', 'x', 'b']);
      expect(current.sources).toEqual(before.sources);
    }
  } finally {
    await Promise.allSettled([fixture.left.close(), fixture.right.close()]);
    await fs.rm(fixture.root, { force: true, recursive: true });
  }
});
