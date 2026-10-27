import { z } from 'zod';

export const cycleRowSchema = z.object({ node_id: z.string(), order_key: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  active: z.union([z.literal(0), z.literal(1)]), cohort: z.enum(['queue', 'soon', 'none']),
  handled: z.union([z.literal(0), z.literal(1)]), initial_task: z.union([z.literal(0), z.literal(1)]) });
export type CycleRow = z.infer<typeof cycleRowSchema>;

export const cycleMetaSchema = z.object({ clearKey: z.number().int().nonnegative(), clearedAt: z.string().nullable(),
  scanAfter: z.number().int().nonnegative(), lapLimit: z.number().int().nonnegative(), tailKey: z.number().int().nonnegative(),
  rowsHash: z.string(), stamp: z.string(), remaining: z.number().int().nonnegative(), reviewRemaining: z.number().int().nonnegative() });
export type CycleMeta = z.infer<typeof cycleMetaSchema>;
export const cycleChangeSchema = z.object({ before: z.array(cycleRowSchema), after: z.array(cycleRowSchema),
  source: cycleMetaSchema, target: cycleMetaSchema });
export type CycleChange = z.infer<typeof cycleChangeSchema>;
export const cycleStateSchema = cycleMetaSchema.extend({ change: cycleChangeSchema.optional() });
export type CycleState = z.infer<typeof cycleStateSchema>;

export const EMPTY_CYCLE_HASH = '0'.repeat(64);
export const CYCLE_ENTRY_SCHEMA = `CREATE TABLE daily_flow_entries (
  node_id TEXT PRIMARY KEY, order_key INTEGER NOT NULL UNIQUE CHECK(order_key > 0),
  active INTEGER NOT NULL CHECK(active IN (0,1)), cohort TEXT NOT NULL CHECK(cohort IN ('queue','soon','none')),
  initial_task INTEGER NOT NULL CHECK(initial_task IN (0,1)), handled INTEGER NOT NULL CHECK(handled IN (0,1)))`;
export const CYCLE_ENTRY_INDEX = 'CREATE INDEX daily_flow_cycle_order ON daily_flow_entries(active, order_key)';
