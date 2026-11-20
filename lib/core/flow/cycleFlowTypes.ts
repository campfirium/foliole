import { z } from 'zod';

export const cycleRowSchema = z.object({ node_id: z.string(), order_key: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  active: z.union([z.literal(0), z.literal(1)]), cohort: z.enum(['queue', 'soon', 'none']),
  handled: z.union([z.literal(0), z.literal(1)]), initial_task: z.union([z.literal(0), z.literal(1)]) });
export type CycleRow = z.infer<typeof cycleRowSchema>;

export const cycleMetaSchema = z.object({ clearKey: z.number().int().nonnegative(), clearedAt: z.string().nullable(),
  scanAfter: z.number().int().nonnegative(), lapLimit: z.number().int().nonnegative(), tailKey: z.number().int().nonnegative(),
  remaining: z.number().int().nonnegative(), reviewRemaining: z.number().int().nonnegative(),
  // Local only: the ready cursor to resume after a due timed row was taken out of order.
  timedResume: z.object({ key: z.number().int().positive(), after: z.number().int().nonnegative() }).optional() });
export type CycleMeta = z.infer<typeof cycleMetaSchema>;
export const cycleChangeSchema = z.object({ before: z.array(cycleRowSchema), after: z.array(cycleRowSchema),
  source: cycleMetaSchema, target: cycleMetaSchema });
export type CycleChange = z.infer<typeof cycleChangeSchema>;
export const cycleStateSchema = cycleMetaSchema.extend({ change: cycleChangeSchema.optional() });
export type CycleState = z.infer<typeof cycleStateSchema>;

export const CYCLE_ENTRY_SCHEMA = `CREATE TABLE daily_flow_entries (
  node_id TEXT PRIMARY KEY, order_key INTEGER NOT NULL UNIQUE CHECK(order_key > 0),
  active INTEGER NOT NULL CHECK(active IN (0,1)), cohort TEXT NOT NULL CHECK(cohort IN ('queue','soon','none')),
  initial_task INTEGER NOT NULL CHECK(initial_task IN (0,1)), handled INTEGER NOT NULL CHECK(handled IN (0,1)))`;
export const CYCLE_ENTRY_INDEX = 'CREATE INDEX daily_flow_cycle_order ON daily_flow_entries(active, order_key)';

export type CycleKind = 'review' | 'reading';
/** Derived from the node and its learning facts; a time means the row waits until then. */
export type CycleReadiness = { kind: CycleKind; ready_at_ms: number | null };
/** A row as written or scanned; rows without derived readiness are derived again when a scan meets them. */
export type CycleStoredRow = CycleRow & Partial<CycleReadiness>;
// Readiness lives beside the rows, so rewriting a row always drops what was derived for its old state.
export const CYCLE_READINESS_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS daily_flow_entry_readiness (node_id TEXT PRIMARY KEY,
    kind TEXT NOT NULL CHECK(kind IN ('review','reading')), ready_at_ms INTEGER)`,
  'CREATE INDEX IF NOT EXISTS daily_flow_readiness_timed ON daily_flow_entry_readiness(ready_at_ms) WHERE ready_at_ms IS NOT NULL',
  `CREATE TRIGGER IF NOT EXISTS daily_flow_entry_readiness_retire AFTER DELETE ON daily_flow_entries
    BEGIN DELETE FROM daily_flow_entry_readiness WHERE node_id = OLD.node_id; END`
] as const;

export function toCycleRow(row: CycleStoredRow): CycleRow {
  const { node_id, order_key, active, cohort, initial_task, handled } = row;
  return { node_id, order_key, active, cohort, initial_task, handled };
}
