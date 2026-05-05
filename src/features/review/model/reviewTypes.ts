import {
  createInitialSchedulerCard,
  type SchedulerCard
} from '../../../../lib/core/review/index.js';
import type { NodeReviewProfile } from '../../nodes/model/nodeTypes';

export {
  createInitialSchedulerCard
} from '../../../../lib/core/review/index.js';
export {
  mapGradeToRustRating
} from '../../../../lib/core/review/index.js';
export type {
  ReviewGrade,
  ReviewSchedulerAdapter,
  ReviewState,
  SchedulerCard,
  SchedulerGradeInput,
  SchedulerGradeResult,
  SchedulerPreviewInput,
  SchedulerPreviewResult
} from '../../../../lib/core/review/index.js';

export function toSchedulerCard(profile: NodeReviewProfile | null, now: string): SchedulerCard {
  if (!profile) {
    return createInitialSchedulerCard(now);
  }
  return {
    due: profile.due,
    last_review: profile.lastReviewAt,
    state: profile.state,
    stability: profile.stability,
    difficulty: profile.difficulty,
    elapsed_days: profile.elapsedDays,
    scheduled_days: profile.scheduledDays,
    reps: profile.reps,
    lapses: profile.lapses
  };
}

export function toNodeReviewProfile(card: SchedulerCard): NodeReviewProfile {
  return {
    due: card.due,
    lastReviewAt: card.last_review,
    state: card.state,
    stability: card.stability,
    difficulty: card.difficulty,
    elapsedDays: card.elapsed_days,
    scheduledDays: card.scheduled_days,
    reps: card.reps,
    lapses: card.lapses
  };
}
