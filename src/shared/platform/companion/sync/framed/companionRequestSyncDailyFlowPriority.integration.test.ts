// @vitest-environment node
import Database from 'better-sqlite3';
import { expect, it, vi } from 'vitest';

import * as batchExchange from '../../../../../../lib/core/sync/requestSyncBatchExchange.js';
import { createCompanionRequestFixture } from '../../../../../test/companionRequestSync.testSupport.js';
import { advanceLargeFlow, createLargeFlow } from '../../../../../test/largeDailyFlowSync.testSupport.js';

it('receives learning operations with their required original material before an unrelated large body can block real HTTP', async () => {
  const receiver = await createCompanionRequestFixture();
  const original = batchExchange.transferRequestSyncBatch;
  let blocked = false;
  try {
    for (let index = 0; index < 3; index++) await receiver.fixture.right.seed({
      nodeId: `z-required-${index}`, title: `Required ${index}`, content: `Original material ${index}`
    });
    await createLargeFlow(receiver.fixture.rightSnapshot.databasePath);
    await advanceLargeFlow(receiver.fixture.rightSnapshot.databasePath);
    await receiver.fixture.right.seed({ nodeId: 'a-unrelated', title: 'Unrelated', content: 'Large unrelated body '.repeat(40_000) });
    const observe = vi.spyOn(batchExchange, 'transferRequestSyncBatch').mockImplementation(async (...args) => {
      if (args[2].some(item => item.globalId === 'a-unrelated')) {
        blocked = true;
        expect(receiver.sqlite.prepare('SELECT count(*) FROM daily_flow_sync_facts').pluck().get()).toBe(1);
        expect(receiver.sqlite.prepare('SELECT count(*) FROM daily_flow_entries').pluck().get()).toBe(0);
        expect(receiver.sqlite.prepare("SELECT count(*) FROM nodes WHERE id LIKE 'z-required-%' AND content LIKE 'Original material %'").pluck().get()).toBe(1);
        expect(receiver.sqlite.prepare("SELECT count(*) FROM nodes WHERE id='a-unrelated'").pluck().get()).toBe(0);
        throw new Error('fixture_unrelated_body_blocked');
      }
      return original(...args);
    });
    try { await expect(receiver.sync()).rejects.toThrow('fixture_unrelated_body_blocked'); }
    finally { observe.mockRestore(); }
    expect(blocked).toBe(true);
    await receiver.restart();
    expect(receiver.sqlite.prepare('SELECT * FROM daily_flow_sync_projection').get()).toBeUndefined();
    expect((await receiver.sync()).remainingStructureChangeCount).toBe(0);
    const remote = new Database(receiver.fixture.rightSnapshot.databasePath, { readonly: true });
    try {
      expect(receiver.sqlite.prepare("SELECT content FROM nodes WHERE id='a-unrelated'").pluck().get())
        .toBe(remote.prepare("SELECT content FROM nodes WHERE id='a-unrelated'").pluck().get());
    } finally { remote.close(); }
    expect(receiver.sqlite.prepare('SELECT count(*) FROM daily_flow_sync_facts WHERE kind=\'create\'').pluck().get()).toBe(0);
  } finally { await receiver.close(); }
});
