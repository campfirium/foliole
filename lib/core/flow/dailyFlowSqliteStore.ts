import type { DbPort } from '../sync/dbPort.js';

import { scopedDailyLearningSnapshot } from './dailyFlowGrade.js';
import type { DailyFlowPersistence } from './dailyFlowService.js';
import { insertCycleRows, readCycleRows, readDailyFlow, saveCycleFlow, writeCycleRows } from './dailyFlowStorage.js';
import type { DailyFlowOperation, DailyFlowStore } from './dailyFlowStore.js';

export function createSqliteDailyFlowStore(db: DbPort, persistence: DailyFlowPersistence): DailyFlowStore {
  let cleared = false;
  let initializing = false;
  return {
    async readState() {
      const state = await readDailyFlow(db);
      initializing = !state;
      return state;
    },
    readRows: ids => readCycleRows(db, ids),
    scanRows: (after, through, count) => db.query(`SELECT * FROM daily_flow_entries WHERE active=1
      AND order_key > ? AND order_key <= ? ORDER BY order_key LIMIT ?`, [after, through, count]),
    async writeRows(rows) {
      const checkEmpty = initializing && rows.length > 0;
      initializing = false;
      // State absence alone does not prove emptiness; inspect rows under the same transaction owner.
      const empty = cleared || (checkEmpty && !(await db.query('SELECT 1 FROM daily_flow_entries LIMIT 1')).length);
      const write = empty ? insertCycleRows : writeCycleRows;
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
