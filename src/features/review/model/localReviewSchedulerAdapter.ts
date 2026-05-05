import {
  mapGradeToRustRating,
  type ReviewSchedulerAdapter,
  type SchedulerCard,
  type SchedulerGradeInput,
  type SchedulerGradeResult,
  type SchedulerPreviewInput,
  type SchedulerPreviewResult
} from './reviewTypes';

const NEXT_INTERVAL_DAYS = {
  Again: 0,
  Hard: 1,
  Good: 3,
  Easy: 7
} as const;

function addDays(timestamp: string, days: number): string {
  const base = new Date(timestamp);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString();
}

function updateCard(card: SchedulerCard, input: SchedulerGradeInput): SchedulerCard {
  const rating = mapGradeToRustRating(input.grade);
  const nextDays = NEXT_INTERVAL_DAYS[rating];
  const reviewedAt = input.now;
  return {
    ...card,
    due: addDays(reviewedAt, nextDays),
    last_review: reviewedAt,
    state: rating === 'Again' ? 1 : 2,
    stability: Math.max(0, card.stability + (rating === 'Again' ? 0.2 : 0.8)),
    difficulty: Math.max(1, card.difficulty + (rating === 'Again' ? 0.6 : -0.1)),
    elapsed_days: card.scheduled_days,
    scheduled_days: nextDays,
    reps: card.reps + 1,
    lapses: card.lapses + (rating === 'Again' ? 1 : 0)
  };
}

function createPreviewResult(card: SchedulerCard, now: string): SchedulerPreviewResult {
  return {
    Again: { card: updateCard(card, { card, grade: 1, now }), reviewed_at: now },
    Hard: { card: updateCard(card, { card, grade: 2, now }), reviewed_at: now },
    Good: { card: updateCard(card, { card, grade: 3, now }), reviewed_at: now },
    Easy: { card: updateCard(card, { card, grade: 4, now }), reviewed_at: now }
  };
}

export function createLocalReviewSchedulerAdapter(): ReviewSchedulerAdapter {
  return {
    grade: async (input): Promise<SchedulerGradeResult> => {
      const nextCard = updateCard(input.card, input);
      return {
        card: nextCard,
        reviewed_at: input.now
      };
    },
    preview: async (input: SchedulerPreviewInput): Promise<SchedulerPreviewResult> => {
      return createPreviewResult(input.card, input.now);
    }
  };
}
