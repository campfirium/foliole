import { Rating, fsrs, type Grade } from 'ts-fsrs';

interface SchedulerCard {
  due: string;
  last_review: string | null;
  state: 0 | 1 | 2 | 3;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  reps: number;
  lapses: number;
}

export interface ReviewGradeRequest {
  request: {
    card: SchedulerCard;
    rating: 'Again' | 'Hard' | 'Good' | 'Easy';
    now: string;
  };
}

function toRating(value: ReviewGradeRequest['request']['rating']): Grade {
  if (value === 'Again') {
    return Rating.Again;
  }
  if (value === 'Hard') {
    return Rating.Hard;
  }
  if (value === 'Good') {
    return Rating.Good;
  }
  return Rating.Easy;
}

function toTsFsrsCard(card: SchedulerCard) {
  return {
    due: new Date(card.due),
    last_review: card.last_review ? new Date(card.last_review) : undefined,
    state: card.state,
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    reps: card.reps,
    lapses: card.lapses
  };
}

function fromTsFsrsCard(card: {
  due: Date;
  last_review?: Date;
  state: 0 | 1 | 2 | 3;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  reps: number;
  lapses: number;
}): SchedulerCard {
  return {
    due: card.due.toISOString(),
    last_review: card.last_review ? card.last_review.toISOString() : null,
    state: card.state,
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    reps: card.reps,
    lapses: card.lapses
  };
}

const scheduler = fsrs();

export function reviewGrade(payload: ReviewGradeRequest) {
  const reviewAt = new Date(payload.request.now);
  const grade = toRating(payload.request.rating);
  const next = scheduler.next(toTsFsrsCard(payload.request.card), reviewAt, grade);
  return {
    card: fromTsFsrsCard(next.card),
    reviewed_at: next.log.review.toISOString()
  };
}
