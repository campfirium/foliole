// @vitest-environment node
import { expect, it } from 'vitest';

import { createCompanionRequestFixture } from '../../../../../test/companionRequestSync.testSupport';
import { refreshCompanionWorkspaceSnapshot } from '../../companionWorkspaceSnapshotRefresh';
import { holdCompanionSyncAppliedRefresh } from '../../companionWorkspaceSnapshotStore';
import { openCompanionDailyFlow } from '../../runtime/companionDailyFlow';
import { getIosCompanionDatabaseOwner } from '../../runtime/iosCompanionDatabaseBootstrap';

it('uses committed order and eligibility after real HTTP changes while display notifications are held', async () => {
  const host = await createCompanionRequestFixture();
  let release = () => {};
  try {
    const remote = host.fixture.right;
    await remote.seed({ nodeId: 'order-a', title: 'A', content: '', kind: 'folder' });
    await remote.seed({ nodeId: 'order-b', title: 'B', content: '', kind: 'folder' });
    await remote.seed({ nodeId: 'order-leaf', title: 'Leaf', content: 'Complete body', parentNodeId: 'order-a' });
    await host.sync();
    await refreshCompanionWorkspaceSnapshot({ kind: 'full' });
    const owner = getIosCompanionDatabaseOwner();
    const order = async () => owner.read(async db => (await owner.readNodeOrder(db)).filter(id => id.startsWith('order-')));
    expect(await order()).toEqual(['order-a', 'order-leaf', 'order-b']);
    release = holdCompanionSyncAppliedRefresh();
    await remote.seed({ nodeId: 'order-leaf', title: 'Leaf', content: 'Complete body', parentNodeId: 'order-b' });
    await host.sync();
    expect(host.sqlite.prepare("SELECT parent_id FROM nodes WHERE id='order-leaf'").pluck().get()).toBe('order-b');
    expect(await order()).toEqual(['order-a', 'order-b', 'order-leaf']);
    expect(await owner.read(async db => (await owner.readNodeIndex(db, 5)).paths.get('order-leaf')))
      .toEqual(['order-b', 'order-leaf']);
    const opened = await openCompanionDailyFlow({ now: new Date().toISOString(), mode: 'reading-only' });
    expect(opened.session.currentNodeId).toBe('order-leaf');
    expect(host.sqlite.prepare("SELECT node_id FROM daily_flow_entries WHERE node_id LIKE 'order-%' ORDER BY order_key").all())
      .toEqual([{ node_id: 'order-leaf' }]);
    expect(host.sqlite.prepare("SELECT parent_id, content FROM nodes WHERE id = 'order-leaf'").get())
      .toEqual({ parent_id: 'order-b', content: 'Complete body' });
    await remote.seed({ nodeId: 'order-leaf', title: 'Leaf', content: 'Complete body', kind: 'folder', parentNodeId: 'order-b' });
    await host.sync();
    await owner.runWriter(async db => {
      await db.run('DELETE FROM daily_flow_state');
      await db.run('DELETE FROM daily_flow_entries');
      await db.run('DELETE FROM daily_flow_operations');
    });
    const changed = await openCompanionDailyFlow({ now: new Date().toISOString(), mode: 'reading-only' });
    expect(changed.session.currentNodeId).toBeNull();
    expect(host.sqlite.prepare("SELECT node_id FROM daily_flow_entries WHERE node_id LIKE 'order-%'").all()).toEqual([]);
    expect(host.sqlite.prepare("SELECT kind, content FROM nodes WHERE id='order-leaf'").get())
      .toEqual({ kind: 'folder', content: 'Complete body' });
    expect(await order()).toEqual(['order-a', 'order-b', 'order-leaf']);
  } finally { release(); await host.close(); }
});
