// @vitest-environment node
import Database from 'better-sqlite3';
import { expect, it, vi } from 'vitest';

import { DailyFlowTableFiles } from '../../../../../../lib/core/sync/dailyFlowTableFiles.js';
import { FRAMED_SYNC_LIMITS } from '../../../../../../lib/core/sync/framedSyncContract.js';
import { createCompanionRequestFixture } from '../../../../../test/companionRequestSync.testSupport.js';
import { advanceLargeFlow, createLargeFlow, migrateLegacyLargeFlow, readPersistedLargeFlow, seedLargeFlowLibrary } from '../../../../../test/largeDailyFlowSync.testSupport.js';

it.each([10, 14_241])('persists all %i daily list members and progress through HTTP, repeat and restart',
  { meta: { calibratedMs: 120_000 } }, async count => {
    const receiver = await createCompanionRequestFixture();
    try {
      seedLargeFlowLibrary(receiver.sqlite, count);
      const source = new Database(receiver.fixture.rightSnapshot.databasePath);
      try { seedLargeFlowLibrary(source, count); } finally { source.close(); }
      const created = await createLargeFlow(receiver.fixture.rightSnapshot.databasePath);
      expect(created.fact.rows).toHaveLength(count);
      if (count > 10) expect(Buffer.byteLength(created.payload_json))
        .toBeGreaterThan(FRAMED_SYNC_LIMITS.maxCanonicalStringBytes);
      if (count > 10) migrateLegacyLargeFlow(receiver.fixture.rightSnapshot.databasePath, created.fact);
      const expected = readPersistedLargeFlow(receiver.fixture.rightSnapshot.databasePath);
      expect(expected.rows).toEqual(created.fact.rows);
      expect(receiver.sqlite.prepare('SELECT count(*) FROM daily_flow_sync_facts').pluck().get()).toBe(0);

      try {
        expect((await receiver.sync()).remainingStructureChangeCount).toBe(0);
      } catch (error) {
        const failed = readPersistedLargeFlow(receiver.fixture.leftSnapshot.databasePath);
        expect(failed.rows).toEqual([]);
        expect(failed.facts).toEqual([]);
        expect(failed.learning).toEqual(expected.learning);
        expect(failed.reviews).toEqual(expected.reviews);
        expect(readPersistedLargeFlow(receiver.fixture.rightSnapshot.databasePath)).toEqual(expected);
        throw error;
      }
      const assertReceived = () => {
        const received = readPersistedLargeFlow(receiver.fixture.leftSnapshot.databasePath);
        expect(received.rows).toEqual(expected.rows);
        expect(received.facts).toEqual(expected.facts);
        expect(received.factRows).toEqual(expected.factRows);
        expect(received.learning).toEqual(expected.learning);
        expect(received.reviews).toEqual(expected.reviews);
        const stored = received.state as { session_json: string };
        const session = JSON.parse(stored.session_json);
        expect(session.currentNodeId).toBe(created.result.session.currentNodeId);
        expect(session.cycle).toEqual(created.result.session.cycle);
        expect(session.dayWindow).toEqual(created.fact.settings.dayWindow);
      };
      assertReceived();
      await receiver.restart();
      assertReceived();
      expect((await receiver.sync()).remainingStructureChangeCount).toBe(0);
      assertReceived();
      expect(readPersistedLargeFlow(receiver.fixture.rightSnapshot.databasePath)).toEqual(expected);
      await assertSubsequentOperation(receiver, created.id, expected);
    } finally { await receiver.close(); }
  });

async function assertSubsequentOperation(receiver: Awaited<ReturnType<typeof createCompanionRequestFixture>>,
  rootId: string, expected: ReturnType<typeof readPersistedLargeFlow>) {
const observe = vi.spyOn(DailyFlowTableFiles.prototype, 'accept');
try {
  await advanceLargeFlow(receiver.fixture.rightSnapshot.databasePath);
  expect((await receiver.sync()).remainingStructureChangeCount).toBe(0);
  const begins = observe.mock.calls.map(([message]) => message).filter(message => message.payloadCase === 'daily_flow_table_begin');
  expect(begins.length).toBeGreaterThan(0);
  expect(begins.every(message => (message.payload as { purpose: string }).purpose === 'operation')).toBe(true);
  const final = readPersistedLargeFlow(receiver.fixture.leftSnapshot.databasePath);
  const source = readPersistedLargeFlow(receiver.fixture.rightSnapshot.databasePath);
  expect(final.rows).toEqual(source.rows);
  expect(final.facts).toEqual(source.facts);
  expect(final.factRows).toEqual(source.factRows);
  expect(final.learning).toEqual(expected.learning);
  expect(final.reviews).toEqual(expected.reviews);
  expect(receiver.sqlite.prepare('SELECT root_id FROM daily_flow_sync_projection').pluck().get()).toBe(rootId);
} finally { observe.mockRestore(); }
}
