import type { DbPort, DbRow } from './dbPort.js';

export interface SyncPackReviewLogOptions {
  incomingAlias?: string;
}

export interface ApplyReviewLogRecordsOptions {
  includeAlreadyApplied?: boolean;
  requireExistingNode?: boolean;
}

export interface ReviewLogRecordInput {
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

export interface SyncPackReviewLogRecord extends DbRow, ReviewLogRecordInput {}

export async function applySyncPackReviewLogWithDbPort(
  port: DbPort,
  options: SyncPackReviewLogOptions = {}
) {
  if (!await incomingReviewLogTableExists(port, options)) return [];
  const records = await loadIncomingReviewLog(port, options);
  return applyReviewLogRecordsWithDbPort(port, records, { includeAlreadyApplied: true, requireExistingNode: true });
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

function insertReviewLog(port: DbPort, record: ReviewLogRecordInput) {
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

async function existingReviewLog(port: DbPort, opId: string) {
  const [record] = await port.query<SyncPackReviewLogRecord>(
    `SELECT id, op_id, device_id, node_id, grade, scheduler_version, reviewed_at,
       due_before, stability_before, difficulty_before, due_after, stability_after, difficulty_after
     FROM review_log WHERE op_id = ? LIMIT 1`,
    [opId]
  );
  return record ?? null;
}

function sameReviewLog(left: ReviewLogRecordInput, right: ReviewLogRecordInput) {
  return left.id === right.id
    && left.op_id === right.op_id
    && left.device_id === right.device_id
    && left.node_id === right.node_id
    && left.grade === right.grade
    && left.scheduler_version === right.scheduler_version
    && left.reviewed_at === right.reviewed_at
    && left.due_before === right.due_before
    && left.stability_before === right.stability_before
    && left.difficulty_before === right.difficulty_before
    && left.due_after === right.due_after
    && left.stability_after === right.stability_after
    && left.difficulty_after === right.difficulty_after;
}

export async function applyReviewLogRecordsWithDbPort(
  port: DbPort,
  records: ReviewLogRecordInput[],
  options: ApplyReviewLogRecordsOptions = {}
) {
  return await port.transaction(async (tx) => {
    const appliedOpIds: string[] = [];
    for (const record of records) {
      if (!record.op_id.trim()) continue;
      if (options.requireExistingNode && !await nodeExists(tx, record.node_id)) continue;
      const existing = await existingReviewLog(tx, record.op_id);
      if (existing) {
        if (!sameReviewLog(existing, record)) {
          throw new Error(`sync_review_log_op_mismatch:${record.op_id}`);
        }
        if (options.includeAlreadyApplied) appliedOpIds.push(record.op_id);
        continue;
      }
      const result = await insertReviewLog(tx, record);
      if (result.changes > 0 || options.includeAlreadyApplied) {
        appliedOpIds.push(record.op_id);
      }
    }
    return appliedOpIds;
  });
}
