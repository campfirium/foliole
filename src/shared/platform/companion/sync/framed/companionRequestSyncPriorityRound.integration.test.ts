// @vitest-environment node
import { expect, it, vi } from 'vitest';

import { REQUEST_SYNC_BATCH_OBJECTS } from '../../../../../../lib/core/sync/requestSyncBatchContract';
import * as batchExchange from '../../../../../../lib/core/sync/requestSyncBatchExchange';
import { createCompanionRequestFixture } from '../../../../../test/companionRequestSync.testSupport';
import { openCompanionDailyFlow } from '../../runtime/companionDailyFlow';
import { getIosCompanionDatabaseOwner } from '../../runtime/iosCompanionDatabaseBootstrap';

it.each(['complete', 'interrupted', 'local-flow'] as const)(
  'refreshes committed priorities at the ordinary sync boundary (%s)',
  { meta: { calibratedMs: 30000 } },
  async outcome => {
    const host = await createCompanionRequestFixture();
    const owner = getIosCompanionDatabaseOwner();
    const transfer = batchExchange.transferRequestSyncBatch;
    const count = REQUEST_SYNC_BATCH_OBJECTS + 9;
    const received = () => host.sqlite.prepare("SELECT id FROM nodes WHERE id LIKE 't326-complete-%' ORDER BY id")
      .pluck().all() as string[];
    const priorities = () => owner.read(db => owner.readNodePriorities(db, 5));
    let pulls = 0;
    let reads = 0;
    try {
      await priorities();
      const query = host.db.query.bind(host.db);
      vi.spyOn(host.db, 'query').mockImplementation((sql, params) => {
        if (sql.includes(' AS has_content,') && sql.includes(' AS anchor_link FROM nodes')) reads++;
        return query(sql, params);
      });
      await host.fixture.right.invoke('seed_complete_inventory', { count, bodyBytes: 400 });
      const observe = vi.spyOn(batchExchange, 'transferRequestSyncBatch').mockImplementation(async (...args) => {
        if (args[2][0]?.direction !== 'remote_to_local') return transfer(...args);
        if (++pulls === 2 && outcome === 'interrupted') throw new Error('fixture_pull_interrupted');
        const result = await transfer(...args);
        if (pulls === 1) {
          expect(received().length).toBeGreaterThan(0);
          expect(received().length).toBeLessThan(count);
          expect(reads).toBe(0);
          if (outcome === 'local-flow') {
            const flow = await openCompanionDailyFlow({ now: new Date().toISOString(), mode: 'reading-only' });
            expect(received()).toContain(flow.session.currentNodeId);
            expect(host.sqlite.prepare('SELECT node_id FROM daily_flow_entries WHERE node_id=?').pluck()
              .get(flow.session.currentNodeId)).toBe(flow.session.currentNodeId);
            expect(reads).toBe(1);
          }
        }
        return result;
      });
      if (outcome === 'interrupted') {
        await expect(host.sync()).rejects.toThrow('fixture_pull_interrupted');
        expect(received().length).toBeLessThan(count);
      } else {
        expect((await host.sync()).remainingStructureChangeCount).toBe(0);
        expect(received()).toHaveLength(count);
      }
      expect(pulls).toBeGreaterThan(1);
      expect(reads).toBe(outcome === 'local-flow' ? 2 : 1);
      const values = await priorities();
      expect([...values.keys()].filter(id => id.startsWith('t326-complete-')).sort()).toEqual(received());
      if (outcome === 'interrupted') {
        observe.mockRestore();
        await host.sync();
        expect(received()).toHaveLength(count);
        expect([...(await priorities()).keys()].filter(id => id.startsWith('t326-complete-')).sort()).toEqual(received());
      }
    } finally {
      vi.restoreAllMocks();
      await host.close();
    }
  }
);
