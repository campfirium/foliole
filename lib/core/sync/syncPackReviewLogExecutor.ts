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
  host_name: string;
}

export interface SyncPackReviewLogRecord extends DbRow, ReviewLogRecordInput {}

const REVIEW_LOG_BATCH_SIZE = 500;
const REVIEW_LOG_BATCH_MAX_BYTES = 2 * 1024 * 1024;
const REVIEW_LOG_TEXT_COLUMNS = ['id', 'op_id', 'host_name', 'node_id',
  'scheduler_version', 'reviewed_at', 'due_before', 'due_after'];

export async function applySyncPackReviewLogWithDbPort(
  port: DbPort,
  options: SyncPackReviewLogOptions = {}
) {
  if (!await incomingReviewLogTableExists(port, options)) return [];
  return port.transaction(async (tx) => {
    const appliedOpIds: string[] = [];
    let last: Pick<ReviewLogRecordInput, 'reviewed_at' | 'op_id'> | null = null;
    for (;;) {
      const lengths = await loadIncomingReviewLogLengths(tx, options, last);
      if (lengths.length === 0) break;
      let bytes = 0;
      let count = 0;
      for (const row of lengths) {
        if (!Number.isSafeInteger(row.payload_bytes) || row.payload_bytes < 0 ||
            row.payload_bytes > REVIEW_LOG_BATCH_MAX_BYTES) {
          throw new Error('sync_pack_review_log_row_exceeds_budget');
        }
        if (bytes + row.payload_bytes > REVIEW_LOG_BATCH_MAX_BYTES) break;
        bytes += row.payload_bytes;
        count++;
      }
      const records = await loadIncomingReviewLog(tx, options, last, count);
      if (records.length !== count) throw new Error('sync_pack_review_log_source_changed');
      appliedOpIds.push(...await applyReviewLogRecordsWithDbPort(tx, records, {
        includeAlreadyApplied: true, requireExistingNode: true
      }));
      const final = records[records.length - 1]!;
      last = { reviewed_at: final.reviewed_at, op_id: final.op_id };
      if (lengths.length < REVIEW_LOG_BATCH_SIZE && count === lengths.length) break;
    }
    return appliedOpIds;
  });
}

async function incomingReviewLogTableExists(port: DbPort, options: SyncPackReviewLogOptions) {
  const alias = options.incomingAlias ?? 'inc';
  const rows = await port.query(`SELECT 1 FROM ${alias}.sqlite_master WHERE type = 'table' AND name = ? LIMIT 1`, ['review_log']);
  return rows.length > 0;
}

function incomingReviewLogPage<T extends DbRow>(port: DbPort, options: SyncPackReviewLogOptions,
  last: Pick<ReviewLogRecordInput, 'reviewed_at' | 'op_id'> | null,
  columns: string, limit: number) {
  const alias = options.incomingAlias ?? 'inc';
  return port.query<T>(
    `SELECT ${columns} FROM ${alias}.review_log ` +
    `${last ? 'WHERE reviewed_at > ? OR (reviewed_at = ? AND op_id > ?) ' : ''}` +
    `ORDER BY reviewed_at ASC, op_id ASC LIMIT ?`,
    last ? [last.reviewed_at, last.reviewed_at, last.op_id, limit] : [limit]
  );
}

function loadIncomingReviewLogLengths(port: DbPort, options: SyncPackReviewLogOptions,
  last: Pick<ReviewLogRecordInput, 'reviewed_at' | 'op_id'> | null) {
  const bytes = REVIEW_LOG_TEXT_COLUMNS.map((column) =>
    `length(CAST(${column} AS BLOB))`).join(' + ');
  return incomingReviewLogPage<{ payload_bytes: number }>(port, options, last,
    `reviewed_at, op_id, ${bytes} + 64 AS payload_bytes`, REVIEW_LOG_BATCH_SIZE
  );
}

function loadIncomingReviewLog(port: DbPort, options: SyncPackReviewLogOptions,
  last: Pick<ReviewLogRecordInput, 'reviewed_at' | 'op_id'> | null, limit: number) {
  return incomingReviewLogPage<SyncPackReviewLogRecord>(port, options, last,
    `id, op_id, host_name, node_id, grade, scheduler_version, reviewed_at,
     due_before, stability_before, difficulty_before, due_after, stability_after, difficulty_after`,
    limit
  );
}

async function nodeExists(port: DbPort, nodeId: string) {
  const rows = await port.query('SELECT 1 FROM nodes WHERE id = ? LIMIT 1', [nodeId]);
  return rows.length > 0;
}

function insertReviewLog(port: DbPort, record: ReviewLogRecordInput) {
  return port.run(
    `INSERT INTO review_log (` +
    `id, op_id, host_name, node_id, grade, scheduler_version, reviewed_at, ` +
    `due_before, stability_before, difficulty_before, due_after, stability_after, difficulty_after` +
    `) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ` +
    `ON CONFLICT(op_id) DO NOTHING`,
    [
      record.id,
      record.op_id,
      record.host_name,
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
    `SELECT id, op_id, host_name, node_id, grade, scheduler_version, reviewed_at,
       due_before, stability_before, difficulty_before, due_after, stability_after, difficulty_after
     FROM review_log WHERE op_id = ? LIMIT 1`,
    [opId]
  );
  return record ?? null;
}

function sameReviewLog(left: ReviewLogRecordInput, right: ReviewLogRecordInput) {
  return left.id === right.id
    && left.op_id === right.op_id
    && left.host_name === right.host_name
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
