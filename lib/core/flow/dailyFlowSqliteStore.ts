import type { DbPort } from '../sync/dbPort.js';

import { toCycleRow, type CycleRow, type CycleStoredRow } from './cycleFlowTypes.js';
import { createScopedDailyLearningReader } from './dailyFlowGrade.js';
import type { DailyFlowPersistence } from './dailyFlowService.js';
import { insertCycleRows, readCycleRows, readDailyFlow, saveCycleFlow, writeCycleRows } from './dailyFlowStorage.js';
import type { CycleScanFilter, DailyFlowOperation, DailyFlowStore } from './dailyFlowStore.js';
import { readDiveFlowMembers } from './diveFlowMembership.js';

const STORED_ROWS = `SELECT e.*, r.kind, r.ready_at_ms FROM daily_flow_entries e
  LEFT JOIN daily_flow_entry_readiness r ON r.node_id = e.node_id`;

export function createSqliteDailyFlowStore(db: DbPort, persistence: DailyFlowPersistence): DailyFlowStore {
  const rowsById = new Map<string, CycleRow | undefined>();
  let cleared = false;
  let initializing = false;
  return {
    readingPreservesPosition: Boolean(persistence.readingPreservesPosition),
    async readState() {
      const state = await readDailyFlow(db);
      initializing = !state;
      return state;
    },
    readDiveMembers: id => readDiveFlowMembers(db, id),
    readRows: cycleRowsReader(db, rowsById),
    scanRows: (after, through, count, filter, nodeIds) => scanCycleRows(db, after, through, count, filter, nodeIds),
    timedRows: (filter, count) => readTimedCycleRows(db, filter, count),
    readReadiness: () => db.query(`${STORED_ROWS} WHERE e.active=1`),
    async writeRows(rows) {
      const checkEmpty = initializing && rows.length > 0;
      initializing = false;
      // State absence alone does not prove emptiness; inspect rows under the same transaction owner.
      const empty = cleared || (checkEmpty && !(await db.query('SELECT 1 FROM daily_flow_entries LIMIT 1')).length);
      const write = empty ? insertCycleRows : writeCycleRows;
      cleared = false;
      await write(db, rows);
      for (const row of rows) rowsById.set(row.node_id, toCycleRow(row));
    },
    async deleteRows(ids) {
      ids.forEach(id => rowsById.delete(id));
      await db.run('DELETE FROM daily_flow_entries WHERE node_id IN (SELECT value FROM json_each(?))', [JSON.stringify(ids)]);
    },
    async resetCycle() {
      rowsById.clear();
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
    scopedLearningSnapshot: createScopedDailyLearningReader(db, persistence),
    snapshot: ids => persistence.snapshot(db, ids),
    grade: (args, opId) => persistence.grade(db, args, opId),
    reading: (value, now) => persistence.reading(db, value, now),
    reviewHistory: (value, now) => persistence.reviewHistory(db, value, now)
  };
}

function cycleRowsReader(db: DbPort, rowsById: Map<string, CycleRow | undefined>) {
  return async (ids?: readonly string[]) => {
    if (!ids) return readCycleRows(db);
    const missing = ids.filter(id => !rowsById.has(id));
    if (missing.length) {
      const rows = new Map((await readCycleRows(db, missing)).map(row => [row.node_id, row]));
      for (const id of missing) rowsById.set(id, rows.get(id));
    }
    const result = ids.flatMap(id => rowsById.get(id) ? [rowsById.get(id)!] : []);
    if (rowsById.size > 128) rowsById.clear();
    return result;
  };
}

// Rows the mode hides or that still wait stay in SQLite instead of crossing to the caller.
function scanCycleRows(db: DbPort, after: number, through: number, count: number, filter?: CycleScanFilter,
  nodeIds?: readonly string[]) {
  if (nodeIds) {
    return db.query<CycleStoredRow>(`SELECT * FROM daily_flow_entries WHERE active=1
      AND order_key > ? AND order_key <= ? AND node_id IN (SELECT value FROM json_each(?)) ORDER BY order_key LIMIT ?`,
    [after, through, JSON.stringify(nodeIds), count]);
  }
  return filter
    ? db.query<CycleStoredRow>(`${STORED_ROWS} WHERE e.active=1 AND e.order_key > ? AND e.order_key <= ?
      AND (r.kind IS NULL OR r.kind IN (SELECT value FROM json_each(?))) AND (r.ready_at_ms IS NULL OR r.ready_at_ms <= ?)
      ORDER BY e.order_key LIMIT ?`, [after, through, JSON.stringify(filter.kinds), filter.nowMs, count])
    : db.query<CycleStoredRow>(`SELECT * FROM daily_flow_entries WHERE active=1
      AND order_key > ? AND order_key <= ? ORDER BY order_key LIMIT ?`, [after, through, count]);
}

function readTimedCycleRows(db: DbPort, filter: CycleScanFilter, count: number) {
  return db.query<CycleStoredRow>(`SELECT e.*, r.kind, r.ready_at_ms FROM daily_flow_entry_readiness r
    JOIN daily_flow_entries e ON e.node_id = r.node_id WHERE r.ready_at_ms IS NOT NULL AND r.ready_at_ms <= ?
    AND r.kind IN (SELECT value FROM json_each(?)) AND e.active=1 ORDER BY r.ready_at_ms, e.order_key LIMIT ?`,
  [filter.nowMs, JSON.stringify(filter.kinds), count]);
}
