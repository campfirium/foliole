import { readNodeReviewHistoryWithDb } from '../../../../lib/core/database/reviewProjection';
import { previewReviewAt } from '../../../../lib/core/review/recomputeReview';
import type { ReviewSchedulerAdapter, SchedulerPreviewInput } from '../../../../lib/core/review/types';
import { getCompanionRuntimeCapability, hasCompanionLocalDatabase } from '../companionRuntimeCapabilities';

import { readIosCompanionDatabase } from './runtime/iosCompanionActiveDatabase';

/** Schedule from facts, never from a snapshot produced with an earlier folder model. */
export function createCompanionReviewSchedulerAdapter(): ReviewSchedulerAdapter | null {
  if (!hasCompanionLocalDatabase(getCompanionRuntimeCapability())) return null;
  return {
    grade: async input => (await history(input))(input.grade),
    preview: async input => {
      const next = await history(input);
      return { Again: next(1), Hard: next(2), Good: next(3), Easy: next(4) };
    }
  };
}

async function history(input: SchedulerPreviewInput) {
  const nodeId = input.nodeId;
  if (!nodeId) throw new Error('companion_review_node_required');
  const { events, parameters } = await readIosCompanionDatabase(db => readNodeReviewHistoryWithDb(db, nodeId));
  return (grade: number) => {
    const card = previewReviewAt(events, parameters, { grade, now: input.now });
    if (!card) throw new Error('review_history_preview_missing');
    return { card, reviewed_at: input.now };
  };
}
