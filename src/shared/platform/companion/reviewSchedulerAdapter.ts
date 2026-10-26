import { readNodeReviewHistoryWithDb } from '../../../../lib/core/database/reviewProjection';
import { recomputeReview } from '../../../../lib/core/review/recomputeReview';
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
    const card = recomputeReview([...events, { op_id: '~preview', kind: 'review', grade,
      reviewed_at: input.now, voids_op_id: null }], parameters);
    if (!card) throw new Error('review_history_preview_missing');
    return { card, reviewed_at: input.now };
  };
}
