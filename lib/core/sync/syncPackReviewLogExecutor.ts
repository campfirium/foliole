import type { DbPort, DbRow } from './dbPort.js';

export interface SyncPackReviewLogOptions {
  incomingAlias?: string;
}

export interface SyncPackReviewLogRecord extends DbRow {
  difficulty_after: number;
  difficulty_before: number;
  due_after: string;
  due_before: string;
  grade: number;
  id: string;
  node_id: string;
  op_id: string;
  reviewed_at: string;
  scheduler_version: string;
  stability_after: number;
  stability_before: number;
  device_id: string;
}

export async function applySyncPackReviewLogWithDbPort(
  port: DbPort,
  options: SyncPackReviewLogOptions = {}
) {
  if (!await incomingReviewLogTableExists(port, options)) return [];
  const records = await loadIncomingReviewLog(port, options);
  return await port.transaction(async (tx) => {
    const appliedOpIds: string[] = [];
    for (const record of records) {
      if (!record.op_id.trim() || !await nodeExists(tx, record.node_id)) continue;
      const result = await insertReviewLog(tx, record);
      if (result.changes > 0 || await reviewLogExists(tx, record.op_id)) {
        appliedOpIds.push(record.op_id);
      }
    }
    return appliedOpIds;
  });
}

async function incomingReviewLogTableExists(port: DbPort, options: SyncPackReviewLogOptions) {
  const alias = options.incomingAlias ?? 'inc';
  const rows = await port.query(`SELECT 1 FROM ${alias}.sqlite_master WHERE type = 'table' AND name = ? LIMIT 1`, ['review_log']);
  return rows.length > 0;
}

function loadIncomingReviewLog(port: DbPort, options: SyncPackReviewLogOptions) {
  const alias = options.incomingAlias ?? 'inc';
  return port.query<SyncPackReviewLogRecord>(
    `SELECT id, op_id, device_id, node_id, grade, scheduler_version, reviewed_at, ` +
    `due_before, stability_before, difficulty_before, due_after, stability_after, difficulty_after ` +
    `FROM ${alias}.review_log ORDER BY reviewed_at ASC, op_id ASC`
  );
}

async function nodeExists(port: DbPort, nodeId: string) {
  const rows = await port.query('SELECT 1 FROM nodes WHERE id = ? LIMIT 1', [nodeId]);
  return rows.length > 0;
}

async function reviewLogExists(port: DbPort, opId: string) {
  const rows = await port.query('SELECT 1 FROM review_log WHERE op_id = ? LIMIT 1', [opId]);
  return rows.length > 0;
}

function insertReviewLog(port: DbPort, record: SyncPackReviewLogRecord) {
  return port.run(
    `INSERT INTO review_log (` +
    `id, op_id, device_id, node_id, grade, scheduler_version, reviewed_at, ` +
    `due_before, stability_before, difficulty_before, due_after, stability_after, difficulty_after` +
    `) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ` +
    `ON CONFLICT(op_id) DO NOTHING`,
    [
      record.id,
      record.op_id,
      record.device_id,
      record.node_id,
      record.grade,
      record.scheduler_version,
      record.reviewed_at,
      record.due_before,
      record.stability_before,
      record.difficulty_before,
      record.due_after,
      record.stability_after,
      record.difficulty_after
    ]
  );
}
