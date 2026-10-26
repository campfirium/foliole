// @vitest-environment node
import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { DAILY_FLOW_SCHEMA } from '../../lib/core/database/dailyFlowSchema.js';
import type { DailyFlowSession } from '../../lib/core/flow/dailyFlowSession.js';
import { readDailyFlow, writeDailyFlow } from '../../lib/core/flow/dailyFlowStorage.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';

it('saves a large Flow order promptly and durably preserves retained, removed and Soon positions', async () => {
  const sqlite = new Database(':memory:');
  try {
    sqlite.exec(DAILY_FLOW_SCHEMA.slice(0, 3).join(';'));
    const db = createBetterSqliteDbPort(sqlite);
    const ids = Array.from({ length: 3000 }, (_, index) => `topic-${index}`);
    const session: DailyFlowSession = { currentNodeId: ids[0]!, queueNodeIds: ids,
      soonNodeIds: [], totalNodeCount: ids.length, isAnswerRevealed: false };
    const args = { dayKey: '2026-10-27', mode: 'recommended', settingsKey: '{"scope":"large"}',
      now: '2026-10-27T00:00:00.000Z', revision: 1, session };
    const started = performance.now();
    const saved = await db.transaction(tx => writeDailyFlow(tx, args));
    const elapsedMs = performance.now() - started;
    expect((await readDailyFlow(db))!.session).toEqual(saved);
    expect(elapsedMs).toBeLessThan(1000);
    const before = (await readDailyFlow(db))!;
    const next = { ...session, currentNodeId: ids[2]!, queueNodeIds: ids.slice(2), soonNodeIds: [ids[0]!] };
    const result = await db.transaction(tx => writeDailyFlow(tx, { ...args, revision: 2, session: next,
      previousEntries: before.entries }));
    const after = (await readDailyFlow(db))!;
    expect(after.session).toEqual(result);
    expect(after.candidateIds).toEqual(ids);
    expect(after.entries.find(row => row.node_id === ids[1])).toMatchObject({ queue_position: null, soon_position: null });
    expect(after.entries.find(row => row.node_id === ids[2])!.queue_position)
      .toBe(before.entries.find(row => row.node_id === ids[2])!.queue_position);
    expect(after.session.soonNodeIds).toEqual([ids[0]]);
  } finally { sqlite.close(); }
}, 30000);
