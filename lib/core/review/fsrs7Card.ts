import { createInitialSchedulerCard, type SchedulerCard } from './types.js';

/** A legacy snapshot cannot seed the dual-trace model. Real events are replayed separately. */
export function normalizeFsrs7Card(card: SchedulerCard): SchedulerCard {
  if (card.state === 0) return { ...card, stability: 0, stability_fast: 0, difficulty: 0 };
  if (card.stability_fast !== undefined && card.stability_fast > 0) return card;
  return createInitialSchedulerCard(card.due);
}
