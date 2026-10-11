// @vitest-environment node
import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { readFixtureInventory } from './desktopFramedSyncPublicationRecovery.testSupport.js';
import { createDesktopFramedSyncTwoProcessFixture, type DesktopFramedSyncFixtureProcess,
  type DesktopFramedSyncFixtureSnapshot } from './desktopFramedSyncTwoProcess.testSupport.js';

const schedules = [
  ['ab', 'ac', 'bc'], ['ab', 'bc', 'ac'], ['ac', 'ab', 'bc'],
  ['ac', 'bc', 'ab'], ['bc', 'ab', 'ac'], ['bc', 'ac', 'ab']
];
const parent = 'parent-child-order:root';

function evidence(file: string) {
  const db = new Database(file, { readonly: true, fileMustExist: true });
  try {
    const order = JSON.parse(String(db.prepare('SELECT child_ids_json FROM parent_child_order WHERE parent_id = ?')
      .pluck().get(parent))) as string[];
    return { order: order.filter((id) => !id.startsWith('special-')),
      sources: db.prepare('SELECT author_id, counter, child_ids_json FROM parent_order_sources WHERE parent_id = ? ORDER BY author_id').all(parent),
      writer: db.prepare('SELECT author_id FROM parent_order_writer').pluck().get(),
      historyTables: db.prepare("SELECT name FROM sqlite_master WHERE name IN ('parent_order_versions', 'parent_order_heads', 'parent_order_member_positions')").all() };
  } finally { db.close(); }
}

function reconcile(sender: DesktopFramedSyncFixtureProcess, peer: DesktopFramedSyncFixtureSnapshot) {
  return sender.invoke('round', { input: { kind: 'reconcile', peer: { deviceId: peer.deviceId,
    libraryEpoch: `${peer.deviceId}-epoch` }, peerOrigin: peer.origin } });
}

it.each(schedules.map((schedule) => [schedule.join(','), schedule] as const))(
  'converges three independent processes with offline additions across exchange order %s', async (_label, schedule) => {
    const fixture = await createDesktopFramedSyncTwoProcessFixture();
    const third = await fixture.startThird();
    const processes = { a: fixture.left, b: fixture.right, c: third.process };
    const snapshots = { a: fixture.leftSnapshot, b: fixture.rightSnapshot, c: third.snapshot };
    try {
      for (const process of Object.values(processes)) await process.invoke('register_order_member', { deviceId: 'desktop-c' });
      for (const nodeId of ['a', 'b']) await fixture.left.seed({ nodeId, title: nodeId, content: `Body ${nodeId}` });
      await reconcile(fixture.left, fixture.rightSnapshot);
      await reconcile(fixture.left, third.snapshot);
      for (const [actor, nodeId, title] of [['a', 'x', 'Topic 2'], ['b', 'y', 'Topic 10'], ['c', 'z', 'Topic 30']] as const) {
        await processes[actor].seed({ nodeId, title, content: `Body ${nodeId}` });
        await processes[actor].invoke('reorder', { nodeIds: ['a', nodeId, 'b'] });
      }
      for (let pass = 0; pass < 2; pass += 1) {
        for (const pair of schedule) {
          const [sender, receiver] = pair === 'ab' ? ['a', 'b'] as const : pair === 'ac' ? ['a', 'c'] as const : ['b', 'c'] as const;
          expect(await reconcile(processes[sender], snapshots[receiver])).toMatchObject({ complete: true, pending: 0 });
        }
      }
      const expected = evidence(fixture.leftSnapshot.databasePath);
      expect(expected.order).toEqual(['a', 'x', 'y', 'z', 'b']);
      expect(expected.sources).toHaveLength(3);
      expect(expected.historyTables).toEqual([]);
      for (const snapshot of Object.values(snapshots)) {
        const actual = evidence(snapshot.databasePath);
        expect(actual.order).toEqual(expected.order);
        expect(actual.sources).toEqual(expected.sources);
      }
      const restarted = await fixture.restartLeft();
      expect(evidence(restarted.snapshot.databasePath)).toEqual(expected);
      await reconcile(restarted.process, fixture.rightSnapshot);
      expect(evidence(restarted.snapshot.databasePath)).toEqual(expected);
      const inventory = await readFixtureInventory(restarted.process);
      expect(inventory.some((entry) => ['order_version', 'parent_order_position'].includes(entry.objectType))).toBe(false);
    } finally {
      await Promise.allSettled([fixture.left.close(), fixture.right.close(), third.process.close()]);
    }
  }, 120_000);
