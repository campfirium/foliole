// @vitest-environment node
import { expect, it } from 'vitest';

import { createCompanionRequestFixture } from '../../../../../test/companionRequestSync.testSupport';
import { refreshCompanionWorkspaceSnapshot } from '../../companionWorkspaceSnapshotRefresh';
import { holdCompanionSyncAppliedRefresh } from '../../companionWorkspaceSnapshotStore';
import { openCompanionDailyFlow } from '../../runtime/companionDailyFlow';
import { getIosCompanionDatabaseOwner } from '../../runtime/iosCompanionDatabaseBootstrap';

it('uses the newly committed order after a real HTTP move while display notifications are held', async () => {
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
  } finally { release(); await host.close(); }
});
