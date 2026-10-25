import { recomputeNodeReviewWithDb } from '../database/reviewProjection.js';

import type { DbPort, DbRow } from './dbPort.js';
import { identityReviewRowSchema } from './syncFactRowSchemas.js';

export interface ApplyReviewLogRecordsOptions {
  includeAlreadyApplied?: boolean;
  requireExistingNode?: boolean;
}

export interface ReviewLogRecordInput {
  grade: number;
  id: string;
  node_id: string;
  op_id: string;
  reviewed_at: string;
  scheduler_version: string;
  host_name: string;
  kind: 'review' | 'reset' | 'void';
  voids_op_id: string | null;
}

export interface SyncReviewLogRecord extends DbRow, ReviewLogRecordInput {}

async function nodeExists(port: DbPort, nodeId: string) {
  const rows = await port.query('SELECT 1 FROM nodes WHERE id = ? LIMIT 1', [nodeId]);
  return rows.length > 0;
}

function insertReviewLog(port: DbPort, record: ReviewLogRecordInput) {
  return port.run(
    `INSERT INTO review_log (` +
    `id, op_id, host_name, node_id, grade, scheduler_version, reviewed_at, ` +
    `kind, voids_op_id` +
    `) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ` +
    `ON CONFLICT(op_id) DO NOTHING`,
    [
      record.id,
      record.op_id,
      record.host_name,
      record.node_id,
      record.grade,
      record.scheduler_version,
      record.reviewed_at,
      record.kind,
      record.voids_op_id
    ]
  );
}

async function existingReviewLog(port: DbPort, opId: string) {
  const [record] = await port.query<SyncReviewLogRecord>(
    `SELECT id, op_id, host_name, node_id, grade, scheduler_version, reviewed_at,
       kind, voids_op_id
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
    && left.kind === right.kind
    && left.voids_op_id === right.voids_op_id;
}

export async function applyReviewLogRecordsWithDbPort(
  port: DbPort,
  records: ReviewLogRecordInput[],
  options: ApplyReviewLogRecordsOptions = {}
) {
  return await port.transaction(async (tx) => {
    const appliedOpIds: string[] = [];
    for (const source of records) {
      if (!source.op_id.trim()) continue;
      const record = identityReviewRowSchema.parse(source);
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
      if (result.changes > 0) await recomputeNodeReviewWithDb(tx, record.node_id);
      if (result.changes > 0 || options.includeAlreadyApplied) {
        appliedOpIds.push(record.op_id);
      }
    }
    return appliedOpIds;
  });
}
