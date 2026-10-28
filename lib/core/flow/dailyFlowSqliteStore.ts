import type { DbPort } from '../sync/dbPort.js';

import { scopedDailyLearningSnapshot } from './dailyFlowGrade.js';
import type { DailyFlowPersistence } from './dailyFlowService.js';
import { insertCycleRows, readCycleRows, readDailyFlow, saveCycleFlow, writeCycleRows } from './dailyFlowStorage.js';
import type { DailyFlowOperation, DailyFlowStore } from './dailyFlowStore.js';

export function createSqliteDailyFlowStore(db: DbPort, persistence: DailyFlowPersistence): DailyFlowStore {
  let cleared = false;
  return {
    readState: () => readDailyFlow(db),
    readRows: ids => readCycleRows(db, ids),
    scanRows: (after, through, count) => db.query(`SELECT * FROM daily_flow_entries WHERE active=1
      AND order_key > ? AND order_key <= ? ORDER BY order_key LIMIT ?`, [after, through, count]),
    writeRows(rows) {
      const write = cleared ? insertCycleRows : writeCycleRows;
      cleared = false;
      return write(db, rows);
    },
    async deleteRows(ids) {
      await db.run('DELETE FROM daily_flow_entries WHERE node_id IN (SELECT value FROM json_each(?))', [JSON.stringify(ids)]);
    },
    async resetCycle() {
      await db.run('DELETE FROM daily_flow_entries');
      await db.run('DELETE FROM daily_flow_operations');
      // This store belongs to the caller's transaction; only its next batch is known empty.
      cleared = true;
    },
    saveState: args => saveCycleFlow(db, args),
    async readOperation(id) {
      const [row] = await db.query<DailyFlowOperation>(
        'SELECT input_hash, revision, card_json, source_session_json FROM daily_flow_operations WHERE op_id = ?', [id]);
      return row ?? null;
    },
    async saveOperation(id, value) {
      await db.run('INSERT INTO daily_flow_operations (op_id, input_hash, revision, card_json, source_session_json) VALUES (?, ?, ?, ?, ?)',
        [id, value.input_hash, value.revision, value.card_json, value.source_session_json]);
    },
    learningSnapshot: ids => persistence.learningSnapshot(db, ids),
    scopedLearningSnapshot: ids => scopedDailyLearningSnapshot(db, persistence, [...ids]),
    snapshot: ids => persistence.snapshot(db, ids),
    grade: (args, opId) => persistence.grade(db, args, opId),
    reading: (value, now) => persistence.reading(db, value, now),
    reviewHistory: (value, now) => persistence.reviewHistory(db, value, now)
  };
}
