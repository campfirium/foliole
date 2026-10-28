import Database from 'better-sqlite3';

import type { CycleRow } from '../../lib/core/flow/cycleFlowTypes.js';
import { loadDailyFlowLearningSnapshot } from '../../lib/core/flow/dailyFlowLearningSnapshot.js';
import { openDailyFlow, type DailyFlowPersistence } from '../../lib/core/flow/dailyFlowService.js';
import { DEFAULT_REVIEW_SCHEDULER_SETTINGS } from '../../lib/core/review/settings.js';
import type { DbParams, DbPort, DbRow } from '../../lib/core/sync/dbPort.js';

import { createPeer, startLibraries, type Peer } from './syncLibrary.testSupport.js';

export const now = '2026-10-29T08:00:00.000Z';
const unsupported = async (): Promise<never> => { throw new Error('Unexpected learning write'); };
export const persistence: DailyFlowPersistence = {
  learningSnapshot: (db, ids) => loadDailyFlowLearningSnapshot(db, 'desktop', ids),
  snapshot: unsupported, grade: unsupported, reading: unsupported, reviewHistory: unsupported
};
export const settings = { scope: 'empty-generation', newDayStartsAtHour: 4,
  pushQueue: DEFAULT_REVIEW_SCHEDULER_SETTINGS.pushQueue };
export const open = (db: DbPort) => openDailyFlow(db, { now, mode: 'recommended' }, settings, persistence);
export const row = (node_id: string, order_key: number): CycleRow =>
  ({ node_id, order_key, active: 1, cohort: 'queue', initial_task: 1, handled: 0 });

export async function fixture(count = 2) {
  await startLibraries();
  const peer = createPeer('desktop');
  const insert = peer.db.prepare(`INSERT INTO nodes
    (id,kind,title,content,created_at,updated_at) VALUES (?,'topic',?,'Complete body',?,?)`);
  peer.db.transaction(() => {
    for (let index = 0; index < count; index++) {
      const id = `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
      insert.run(id, id, now, now);
    }
  })();
  return peer;
}

export type Call = { sql: string; params: DbParams | undefined };
export function observe(port: DbPort, calls: Call[], afterQuery?: (sql: string) => Promise<void>): DbPort {
  return { ...port, transaction: execute => port.transaction(tx => execute({ ...tx,
    async run(sql, params) {
      calls.push({ sql, params });
      return tx.run(sql, params);
    },
    async query<T extends DbRow>(sql: string, params?: DbParams) {
      calls.push({ sql, params });
      const result = await tx.query<T>(sql, params);
      await afterQuery?.(sql);
      return result;
    }
  })) };
}

export function readIndependent(peer: Peer) {
  const reader = new Database(peer.file, { readonly: true });
  try {
    return { rows: reader.prepare('SELECT * FROM daily_flow_entries ORDER BY order_key').all(),
      state: reader.prepare('SELECT * FROM daily_flow_state').all(),
      operations: reader.prepare('SELECT * FROM daily_flow_operations').all(),
      facts: ['nodes', 'node_reading', 'node_review', 'daily_flow_sync_facts'].map(table =>
        reader.prepare(`SELECT * FROM ${table} ORDER BY 1`).all()) };
  } finally { reader.close(); }
}

export const entryDeletes = (calls: Call[]) => calls.filter(call => /^DELETE FROM daily_flow_entries/.test(call.sql));
export const emptyChecks = (calls: Call[]) => calls.filter(call => /^SELECT 1 FROM daily_flow_entries LIMIT 1$/.test(call.sql));
