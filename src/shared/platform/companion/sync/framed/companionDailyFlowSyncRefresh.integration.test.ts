// @vitest-environment node
import { expect, it } from 'vitest';

import { readCycleRows, readDailyFlow } from '../../../../../../lib/core/flow/dailyFlowStorage';
import { createCompanionRequestFixture } from '../../../../../test/companionRequestSync.testSupport';
import { openCompanionDailyFlow } from '../../runtime/companionDailyFlow';

it('rebuilds an existing local list after a real HTTP round, retaining its current and persisted receipt', async () => {
  const host = await createCompanionRequestFixture();
  try {
    await host.fixture.right.seed({ nodeId: 'flow-first', title: 'First', content: 'First body' });
    await host.sync();
    expect(await readDailyFlow(host.db)).toBeNull();
    const first = await openCompanionDailyFlow({ now: new Date().toISOString(), mode: 'recommended' });
    await host.fixture.right.seed({ nodeId: 'flow-new', title: 'New', content: 'New body' });
    await host.sync();
    const after = (await readDailyFlow(host.db))!;
    expect(after.session.currentNodeId).toBe(first.session.currentNodeId);
    expect(after.revision).toBeGreaterThan(first.session.daily!.revision);
    expect((await readCycleRows(host.db)).some(row => row.node_id === 'flow-new')).toBe(true);
    const rows = await readCycleRows(host.db);
    await host.sync();
    expect(await readDailyFlow(host.db)).toEqual(after);
    expect(await readCycleRows(host.db)).toEqual(rows);
    await host.restart();
    expect((await readDailyFlow(host.db))!.session).toEqual(after.session);
  } finally { await host.close(); }
});
