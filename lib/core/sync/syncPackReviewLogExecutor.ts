import type { DbPort, DbRow } from './dbPort.js';
import { applyReviewLogRecordsWithDbPort, type ReviewLogRecordInput, type SyncReviewLogRecord } from './syncReviewLogApply.js';
export type { SyncReviewLogRecord as SyncPackReviewLogRecord } from './syncReviewLogApply.js';

export interface SyncPackReviewLogOptions {
  incomingAlias?: string;
}

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
  return incomingReviewLogPage<SyncReviewLogRecord>(port, options, last,
    `id, op_id, host_name, node_id, grade, scheduler_version, reviewed_at,
     due_before, stability_before, difficulty_before, due_after, stability_after, difficulty_after`,
    limit
  );
}
