import { z } from 'zod';

import { cycleRowSchema } from '../flow/cycleFlowTypes.js';
import { DAILY_FLOW_ROW_SLOTS, type DailyFlowFactRow } from '../flow/dailyFlowFactRowCodec.js';

export const DAILY_FLOW_TABLE_BATCH_ROWS = 256;
export const DAILY_FLOW_TABLE_BATCH_BYTES = 256 * 1024;
const id = z.string().min(1).max(1024);
const nonnegative = z.coerce.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const uint32 = nonnegative.max(0xffffffff);
const bit = z.number().int().min(0).max(1);
export const dailyFlowTableBeginSchema = z.object({ listId: id,
  purpose: z.enum(['current_table', 'root_history', 'operation']), snapshotId: id, requestedFactId: id,
  headId: z.string(), sessionJson: z.string(), mode: z.string(), memberCount: nonnegative, factCount: uint32 });
export type DailyFlowTableBegin = z.infer<typeof dailyFlowTableBeginSchema>;
const fact = z.object({ factId: id, payloadJson: z.string().max(64 * 1024),
  contentHash: z.instanceof(Uint8Array).refine(value => value.byteLength === 32) });
const row = z.object({ factId: id, slot: z.enum(DAILY_FLOW_ROW_SLOTS), ordinal: uint32, nodeId: id,
  orderKey: nonnegative, active: bit, cohort: z.string(), handled: bit, initialTask: bit });
const member = row.omit({ factId: true, slot: true }).extend({ slot: z.enum(['current', 'before', 'after']) });
const dependency = z.object({ nodeId: id, versionId: z.string(), readingHash: z.string(),
  readingUpdatedAt: z.string(), reviewFactId: z.string(),
  readingLastHandledAt: z.string().default(''), readingRepetitionCount: nonnegative.default(0) });
export const dailyFlowTableRecordSchema = z.object({ fact: fact.nullish(), row: row.nullish(), member: member.nullish(),
  appliedFactId: id.nullish(), dependency: dependency.nullish() }).refine(value =>
  Object.values(value).filter(item => item != null).length === 1, 'daily_flow_table_record_case_invalid');
export type DailyFlowTableRecord = z.infer<typeof dailyFlowTableRecordSchema>;
export const dailyFlowTableBatchSchema = z.object({ batchIndex: uint32,
  records: z.array(dailyFlowTableRecordSchema).min(1).max(DAILY_FLOW_TABLE_BATCH_ROWS) });
export const dailyFlowTableEndSchema = z.object({ recordCount: nonnegative, batchCount: uint32,
  tableHash: z.instanceof(Uint8Array).refine(value => value.byteLength === 32) });

export function storedDailyFlowRow(value: NonNullable<DailyFlowTableRecord['row']>): DailyFlowFactRow {
  const removed = value.slot === 'removedNodeIds';
  const fields = { node_id: value.nodeId, order_key: value.orderKey, active: value.active,
    cohort: value.cohort, handled: value.handled, initial_task: value.initialTask };
  if (!removed) cycleRowSchema.parse(fields);
  return { fact_id: value.factId, slot: value.slot, ordinal: value.ordinal, node_id: value.nodeId,
    order_key: removed ? null : value.orderKey, active: removed ? null : value.active,
    cohort: removed ? null : value.cohort, handled: removed ? null : value.handled,
    initial_task: removed ? null : value.initialTask };
}
