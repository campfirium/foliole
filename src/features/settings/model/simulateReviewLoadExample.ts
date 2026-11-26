import { Rating } from 'ts-fsrs';

import { fsrsDefinition } from '../../../../lib/core/review/fsrsDefinition';
import {
  createReviewSchedulerParameters,
  DEFAULT_REVIEW_SCHEDULER_SETTINGS
} from '../../../../lib/core/review/settings';

const RETENTION_TARGETS = [0.8, 0.85, 0.9, 0.95];
const SIMULATED_STUDY_DATE = new Date('2026-01-01T12:00:00Z');
const SIMULATION_END = SIMULATED_STUDY_DATE.getTime() + 365 * 86_400_000;

function countFirstYearReviews(desiredRetention: number) {
  const parameters = createReviewSchedulerParameters(DEFAULT_REVIEW_SCHEDULER_SETTINGS, { desiredRetention });
  const scheduler = fsrsDefinition.create({ config: { ...parameters, enableFuzz: false } });
  const initialCard = scheduler.newCard({ cardId: 'review-load-example', now: SIMULATED_STUDY_DATE });
  let card = scheduler.review({ card: initialCard, now: SIMULATED_STUDY_DATE, grade: Rating.Good }).card;
  let count = 0;
  while (card.dueAt.getTime() <= SIMULATION_END) {
    card = scheduler.review({ card, now: card.dueAt, grade: Rating.Good }).card;
    count += 1;
  }
  return count;
}

export function simulateReviewLoadExample() {
  return RETENTION_TARGETS.map((retention) => ({
    retention,
    reviews: countFirstYearReviews(retention)
  }));
}
