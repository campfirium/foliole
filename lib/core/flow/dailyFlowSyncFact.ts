import { z } from 'zod';

import { cycleRowSchema } from './cycleFlowTypes.js';
import { dailyFlowSessionSchema } from './dailyFlowSessionSchema.js';

export const dailyFlowSyncFactSchema = z.object({
  id: z.string().min(1), rootId: z.string().min(1), parentId: z.string().nullable(),
  occurredAt: z.string().datetime(),
  kind: z.enum(['create', 'advance', 'undo', 'redo']),
  targetOpId: z.string().nullable(),
  nodeId: z.string().nullable().optional(),
  action: z.enum(['grade', 'read', 'later', 'dismiss', 'soon', 'navigate', 'history']).optional(),
  statsDelta: z.object({ readingElapsedMs: z.number(), reviewElapsedMs: z.number(),
    readTopicCount: z.number(), reviewedItemCount: z.number() }).optional(),
  mode: z.enum(['recommended', 'reading-only', 'review-first']),
  settings: z.object({ newDayStartsAtHour: z.number(), pushQueue: z.unknown(),
    dayWindow: z.object({ start: z.string().datetime(), end: z.string().datetime() }) }),
  session: dailyFlowSessionSchema,
  rows: z.array(cycleRowSchema), removedNodeIds: z.array(z.string())
}).strict();

export type DailyFlowSyncFact = z.infer<typeof dailyFlowSyncFactSchema>;

export const DAILY_FLOW_SYNC_PAYLOAD_SQL =
  'SELECT payload_json FROM daily_flow_sync_facts WHERE id = ?';

export function readDailyFlowSyncFact(payload: string) {
  const fact = dailyFlowSyncFactSchema.parse(JSON.parse(payload));
  if (Date.parse(fact.settings.dayWindow.start) >= Date.parse(fact.settings.dayWindow.end) ||
    fact.occurredAt !== new Date(fact.occurredAt).toISOString() ||
    fact.settings.dayWindow.start !== new Date(fact.settings.dayWindow.start).toISOString() ||
    fact.settings.dayWindow.end !== new Date(fact.settings.dayWindow.end).toISOString() ||
    !fact.session.cycle || (fact.kind === 'create' && (fact.id !== fact.rootId || fact.parentId))) {
    throw new Error('daily_flow_sync_fact_invalid');
  }
  return fact;
}
