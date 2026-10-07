// @vitest-environment node
import { promises as fs } from 'node:fs';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';
import { z } from 'zod';

import { compareFramedSyncInventories } from '../../lib/core/sync/framedSyncInventory.js';

import { readFixtureInventory } from './desktopFramedSyncPublicationRecovery.testSupport.js';
import { createDesktopFramedSyncTwoProcessFixture, type DesktopFramedSyncFixtureSnapshot }
  from './desktopFramedSyncTwoProcess.testSupport.js';

function evidence(file: string) {
  const db = new Database(file, { readonly: true });
  try {
    const parentId = 'parent-child-order:root';
    return {
      head: db.prepare('SELECT version_id FROM parent_order_heads WHERE parent_id = ?').pluck().get(parentId) as string,
      order: JSON.parse(db.prepare('SELECT child_ids_json FROM parent_child_order WHERE parent_id = ?').pluck().get(parentId) as string) as string[],
      versions: db.prepare('SELECT version_id, child_ids_json FROM parent_order_versions WHERE parent_id = ? ORDER BY version_id').all(parentId) as
        Array<{ version_id: string; child_ids_json: string }>
    };
  } finally { db.close(); }
}
function roundArgs(peer: DesktopFramedSyncFixtureSnapshot) {
  return { input: { kind: 'reconcile', peer: { deviceId: peer.deviceId,
    libraryEpoch: `${peer.deviceId}-epoch` }, peerOrigin: peer.origin } };
}

it('keeps an offline common base and losing reorder, then survives collection, restart and restoration', async () => {
  const fixture = await createDesktopFramedSyncTwoProcessFixture();
  try {
    for (const nodeId of ['a', 'b', 'c']) await fixture.left.seed({ nodeId, content: 'Body', title: nodeId });
    await fixture.left.invoke('round', roundArgs(fixture.rightSnapshot));
    await fixture.left.invoke('round', roundArgs(fixture.rightSnapshot));
    await fixture.left.invoke('collect_content');
    await fixture.right.invoke('collect_content');
    const base = evidence(fixture.leftSnapshot.databasePath);
    expect(base.versions.some((row) => row.child_ids_json === 'null')).toBe(true);
    await fixture.right.invoke('reorder', { nodeIds: ['c', 'a', 'b'] });
    const chosen = evidence(fixture.rightSnapshot.databasePath);
    const rightChoice = chosen.head;
    await fixture.left.seed({ nodeId: 'd', content: 'Body', title: 'd' });
    await fixture.left.invoke('reorder', { nodeIds: ['b', 'a', 'c', 'd'] });
    await fixture.left.invoke('collect_content');
    expect(evidence(fixture.leftSnapshot.databasePath).versions.find((row) => row.version_id === base.head)?.child_ids_json)
      .not.toBe('null');
    for (let turn = 0; turn < 3; turn++) await fixture.left.invoke('round', roundArgs(fixture.rightSnapshot));
    await fixture.left.invoke('collect_content');
    await fixture.right.invoke('collect_content');
    const left = evidence(fixture.leftSnapshot.databasePath);
    expect(evidence(fixture.rightSnapshot.databasePath).order).toEqual(left.order);
    expect(left.versions.find((row) => row.version_id === rightChoice)?.child_ids_json).toBe(JSON.stringify(chosen.order));
    const restarted = await fixture.restartLeft();
    await restarted.process.invoke('restore_order', { parentId: 'parent-child-order:root', versionId: rightChoice });
    const restored = evidence(restarted.snapshot.databasePath);
    expect(restored.order.filter((id) => !id.startsWith('special-'))).toEqual(['c', 'a', 'b', 'd']);
    expect(restored.head).not.toBe(rightChoice);
    for (let turn = 0; turn < 3; turn++) await restarted.process.invoke('round', roundArgs(fixture.rightSnapshot));
    expect(evidence(fixture.rightSnapshot.databasePath).order).toEqual(restored.order);
    const settled = evidence(restarted.snapshot.databasePath);
    await restarted.process.invoke('round', roundArgs(fixture.rightSnapshot));
    expect(evidence(restarted.snapshot.databasePath)).toEqual(settled);
  } finally {
    await Promise.allSettled([fixture.left.close(), fixture.right.close()]);
    await fs.rm(fixture.root, { force: true, recursive: true });
  }
}, 60_000);

it.each(['left', 'right'] as const)('replenishes the required base on %s when both inventories know its original identity', async (side) => {
  const fixture = await createDesktopFramedSyncTwoProcessFixture();
  try {
    for (const nodeId of ['a', 'b', 'c']) await fixture.left.seed({ nodeId, content: 'Body', title: nodeId });
    for (let turn = 0; turn < 3; turn++) await fixture.left.invoke('round', roundArgs(fixture.rightSnapshot));
    const retired = fixture[side];
    const holder = fixture[side === 'left' ? 'right' : 'left'];
    const retiredSnapshot = side === 'left' ? fixture.leftSnapshot : fixture.rightSnapshot;
    const holderSnapshot = side === 'left' ? fixture.rightSnapshot : fixture.leftSnapshot;
    const base = evidence(fixture.leftSnapshot.databasePath).head;
    const rejoin = await retired.invoke('standalone_edit');
    await retired.seed({ nodeId: 'd', content: 'Body', title: 'd' });
    expect(evidence(retiredSnapshot.databasePath).versions.find((row) => row.version_id === base)?.child_ids_json)
      .toBe('null');
    await holder.invoke('reorder', { nodeIds: ['c', 'a', 'b'] });
    await retired.invoke('rejoin', rejoin as Record<string, unknown>);
    const [head] = compareFramedSyncInventories({ local: await readFixtureInventory(holder),
      remote: await readFixtureInventory(retired) }).filter((value) => value.objectType === 'order_version' && value.direction === 'local_to_remote');
    const selected = z.object({ publication: z.object({ transferId: z.instanceof(Uint8Array) }) })
      .parse(await holder.invoke('round', { input: { ...roundArgs(retiredSnapshot).input, kind: 'select', difference: head } }));
    await holder.invoke('round', { input: { kind: 'send',
      transferId: Buffer.from(selected.publication.transferId).toString('hex') } });
    const [frozen] = compareFramedSyncInventories({ local: await readFixtureInventory(holder), remote: [] })
      .filter((value) => value.objectType === 'parent_child_order' && value.globalId === 'parent-child-order:root');
    await holder.invoke('round', { input: { ...roundArgs(retiredSnapshot).input, kind: 'select', difference: frozen } });
    await holder.invoke('round', roundArgs(retiredSnapshot));
    for (let turn = 0; turn < 3; turn++) await retired.invoke('round', roundArgs(holderSnapshot));
    const received = evidence(retiredSnapshot.databasePath);
    expect(received.order.filter((id) => ['a', 'b', 'c'].includes(id))).toEqual(['c', 'a', 'b']);
    expect(received.order.filter((id) => id === 'd')).toHaveLength(1);
    expect(evidence(holderSnapshot.databasePath).order).toEqual(received.order);
    expect(received.versions.find((row) => row.version_id === base)?.child_ids_json).not.toBe('null');
    expect(received.versions.some((row) => row.child_ids_json === 'null')).toBe(true);
  } finally {
    await Promise.allSettled([fixture.left.close(), fixture.right.close()]);
    await fs.rm(fixture.root, { force: true, recursive: true });
  }
}, 60_000);

it('keeps the exact published arrangement until its receipt even after edits, collection and sender restart', async () => {
  const fixture = await createDesktopFramedSyncTwoProcessFixture();
  const third = await fixture.startThird();
  try {
    for (const process of [fixture.left, fixture.right, third.process]) {
      await process.invoke('register_order_member', { deviceId: 'desktop-c' });
    }
    await fixture.left.seed({ nodeId: 'a', content: 'Body', title: 'a' });
    for (let turn = 0; turn < 3; turn++) await fixture.left.invoke('round', roundArgs(fixture.rightSnapshot));
    for (let turn = 0; turn < 3; turn++) await fixture.left.invoke('round', roundArgs(third.snapshot));
    await fixture.left.seed({ nodeId: 'b', content: 'Body', title: 'b' });
    const frozen = evidence(fixture.leftSnapshot.databasePath);
    const inventory = await readFixtureInventory(fixture.left);
    const [difference] = compareFramedSyncInventories({ local: inventory, remote: [] })
      .filter((value) => value.objectType === 'order_version' && value.globalId === frozen.head);
    expect(difference).toBeDefined();
    for (const peer of [fixture.rightSnapshot, third.snapshot]) {
      await fixture.left.invoke('round', { input: { ...roundArgs(peer).input, kind: 'select', difference } });
    }
    await fixture.left.seed({ nodeId: 'c', content: 'Body', title: 'c' });
    await fixture.left.invoke('collect_content');
    expect(evidence(fixture.leftSnapshot.databasePath).versions.find((row) => row.version_id === frozen.head)?.child_ids_json)
      .toBe(JSON.stringify(frozen.order));
    const restarted = await fixture.restartLeft();
    for (let turn = 0; turn < 3; turn++) await restarted.process.invoke('round', roundArgs(fixture.rightSnapshot));
    expect(evidence(restarted.snapshot.databasePath).versions.find((row) => row.version_id === frozen.head)?.child_ids_json)
      .toBe(JSON.stringify(frozen.order));
    for (let turn = 0; turn < 3; turn++) await restarted.process.invoke('round', roundArgs(third.snapshot));
    const settled = evidence(restarted.snapshot.databasePath);
    expect(settled.versions.find((row) => row.version_id === frozen.head)?.child_ids_json).toBe('null');
    expect(evidence(fixture.rightSnapshot.databasePath).order).toEqual(settled.order);
  } finally {
    await Promise.allSettled([fixture.left.close(), fixture.right.close(), third.process.close()]);
    await fs.rm(fixture.root, { force: true, recursive: true });
  }
}, 60_000);
