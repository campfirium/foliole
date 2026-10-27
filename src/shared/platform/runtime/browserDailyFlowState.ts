import { z } from 'zod';

import { cycleRowSchema } from '../../../../lib/core/flow/cycleFlowTypes';
import type { CycleRow } from '../../../../lib/core/flow/cycleFlowTypes';
import { dailyFlowCommitSchema } from '../../../../lib/core/flow/dailyFlowContract';
import { dailyFlowSessionSchema } from '../../../../lib/core/flow/dailyFlowSessionSchema';
import type { CycleStored, DailyFlowOperation } from '../../../../lib/core/flow/dailyFlowStore';

export interface BrowserDailyFlowState {
  state: CycleStored | null;
  rows: CycleRow[];
  operations: Record<string, DailyFlowOperation>;
  readingDays: Record<string, string[]>;
  reviewBases: Record<string, import('../../../../lib/core/review/types').SchedulerCard | null>;
  reviewEvents: Record<string, { nodeId: string; schedulerVersion: string; event: import('../../../../lib/core/review/recomputeReview').ReviewEvent }>;
  legacyHistoryIds: string[];
}

export function emptyBrowserDailyFlow(): BrowserDailyFlowState {
  return { state: null, rows: [], operations: {}, readingDays: {}, reviewBases: {}, reviewEvents: {}, legacyHistoryIds: [] };
}

export const browserDailyFlowSchema = z.object({
  state: z.object({ day_key: z.string(), revision: z.number().int().nonnegative(), settings_key: z.string(),
    mode: z.enum(['recommended', 'review-first', 'reading-only']), session_json: z.string(), invalidated: z.union([z.literal(0), z.literal(1)]),
    session: dailyFlowSessionSchema }).nullable(),
  rows: z.array(cycleRowSchema),
  operations: z.record(z.string(), z.object({ input_hash: z.string(), revision: z.number().int().nonnegative(),
    card_json: z.string().nullable(), source_session_json: z.string().nullable() })),
  reviewBases: z.record(z.string(), dailyFlowCommitSchema.shape.grade.unwrap().shape.cardAfter.nullable()),
  reviewEvents: z.record(z.string(), z.object({ nodeId: z.string(), schedulerVersion: z.string(), event: z.object({ op_id: z.string(),
    reviewed_at: z.string(), kind: z.enum(['review', 'reset', 'void']), grade: z.number(), voids_op_id: z.string().nullable() }) })),
  legacyHistoryIds: z.array(z.string()),
  readingDays: z.record(z.string(), z.array(z.string()))
});
