import { z } from 'zod';

import type { ReviewSessionMode } from '../review/queue/reviewQueueTypes.js';

export const dailyFlowViewSchema = z.object({ now: z.string().datetime(),
  mode: z.enum(['recommended', 'review-first', 'reading-only']), includeEntries: z.boolean(),
  continueNodeId: z.string().nullable().optional() }).strict();
export type DailyFlowViewArgs = z.infer<typeof dailyFlowViewSchema>;
export type DailyFlowView = {
  status: 'ready'; scope: string; dayKey: string; revision: number; now: string; mode: ReviewSessionMode;
  currentNodeId: string | null; nodeIds: string[] | null; complete: boolean;
  modeAvailability: Record<ReviewSessionMode, boolean>; canContinueReading: boolean;
};
export type DailyFlowViewResult = DailyFlowView | { status: 'needs-preparation' };
