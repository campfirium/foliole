// @vitest-environment node
import Database from 'better-sqlite3';
import { expect, it, vi } from 'vitest';

import { DailyFlowTableFiles } from '../../../../../../lib/core/sync/dailyFlowTableFiles.js';
import { createCompanionRequestFixture } from '../../../../../test/companionRequestSync.testSupport.js';
import { advanceLargeFlow, createLargeFlow, readPersistedLargeFlow, seedLargeFlowLibrary } from '../../../../../test/largeDailyFlowSync.testSupport.js';

it.each([10, 14_241])('keeps %i local members out of HTTP while delivering only learning operations',
  { meta: { calibratedMs: 120_000 } }, async count => {
    const receiver = await createCompanionRequestFixture();
    const observe = vi.spyOn(DailyFlowTableFiles.prototype, 'accept');
    try {
      seedLargeFlowLibrary(receiver.sqlite, count);
      const source = new Database(receiver.fixture.rightSnapshot.databasePath);
      try { seedLargeFlowLibrary(source, count); } finally { source.close(); }
      const created = await createLargeFlow(receiver.fixture.rightSnapshot.databasePath);
      expect(created.fact.rows).toEqual([]);
      const expected = readPersistedLargeFlow(receiver.fixture.rightSnapshot.databasePath);
      expect(expected.rows).toHaveLength(count);
      expect((await receiver.sync()).remainingStructureChangeCount).toBe(0);
      expect(observe.mock.calls.filter(([message]) => message.payloadCase === 'daily_flow_table_begin')).toEqual([]);
      expect(readPersistedLargeFlow(receiver.fixture.leftSnapshot.databasePath).rows).toEqual([]);
      expect(readPersistedLargeFlow(receiver.fixture.leftSnapshot.databasePath).state).toBeUndefined();
      expect(readPersistedLargeFlow(receiver.fixture.rightSnapshot.databasePath)).toEqual(expected);
      await advanceLargeFlow(receiver.fixture.rightSnapshot.databasePath);
      expect((await receiver.sync()).remainingStructureChangeCount).toBe(0);
      const begins = observe.mock.calls.map(([message]) => message)
        .filter(message => message.payloadCase === 'daily_flow_table_begin');
      expect(begins.length).toBeGreaterThan(0);
      for (const begin of begins) expect(begin.payload).toMatchObject({ purpose: 'operation', memberCount: '0', factCount: 1 });
      const received = readPersistedLargeFlow(receiver.fixture.leftSnapshot.databasePath);
      expect(received.rows).toEqual([]);
      expect(received.state).toBeUndefined();
      expect(received.facts).toHaveLength(1);
      expect(received.factRows.length).toBeLessThan(10);
      const sourceFinal = readPersistedLargeFlow(receiver.fixture.rightSnapshot.databasePath);
      expect(sourceFinal.rows).toHaveLength(count);
      await receiver.restart();
      expect((await receiver.sync()).remainingStructureChangeCount).toBe(0);
      expect(readPersistedLargeFlow(receiver.fixture.leftSnapshot.databasePath)).toEqual(received);
      expect(readPersistedLargeFlow(receiver.fixture.rightSnapshot.databasePath)).toEqual(sourceFinal);
    } finally { observe.mockRestore(); await receiver.close(); }
  });
