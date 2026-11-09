import { z } from 'zod';

import type { ReviewSessionMode } from '../review/queue/reviewQueueTypes.js';

const queuePosition = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const flowMode = z.enum(['recommended', 'review-first', 'reading-only']);
const diveViewScope = z.object({
  id: z.string().min(1),
  mode: flowMode,
  phase: z.enum(['initial', 'today', 'topics']),
  position: queuePosition,
  limit: queuePosition,
  currentNodeId: z.string().nullable(),
  revisitIds: z.array(z.string()),
  stopped: z.boolean()
}).strict();

export const dailyFlowViewSchema = z.object({ now: z.string().datetime(),
  mode: flowMode, includeEntries: z.boolean(),
  continueNodeId: z.string().nullable().optional(), dive: diveViewScope.optional() }).strict();
export type DailyFlowViewArgs = z.infer<typeof dailyFlowViewSchema>;
export type DailyFlowView = {
  status: 'ready'; scope: string; dayKey: string; revision: number; now: string; mode: ReviewSessionMode;
  currentNodeId: string | null; nodeIds: string[] | null; complete: boolean;
  modeAvailability: Record<ReviewSessionMode, boolean>; canContinueReading: boolean;
};
export type DailyFlowViewResult = DailyFlowView | { status: 'needs-preparation' };
