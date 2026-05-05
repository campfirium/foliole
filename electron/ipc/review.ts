import { Rating, fsrs, type FSRS, type Grade } from 'ts-fsrs';

import {
  createReviewSchedulerParameters,
  getReviewSchedulerVersion,
  loadReviewSchedulerSettings
} from '../reviewSchedulerSettings.js';

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

export interface ReviewPreviewRequest {
  request: {
    card: SchedulerCard;
    now: string;
  };
}

interface ReviewSchedulerResult {
  card: SchedulerCard;
  reviewed_at: string;
}

export interface ReviewPreviewResult {
  Again: ReviewSchedulerResult;
  Hard: ReviewSchedulerResult;
  Good: ReviewSchedulerResult;
  Easy: ReviewSchedulerResult;
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

let schedulerCache: { key: string; scheduler: FSRS } | null = null;

function getReviewScheduler() {
  const settings = loadReviewSchedulerSettings();
  const key = getReviewSchedulerVersion(settings);
  if (!schedulerCache || schedulerCache.key !== key) {
    schedulerCache = {
      key,
      scheduler: fsrs(createReviewSchedulerParameters(settings))
    };
  }
  return schedulerCache.scheduler;
}

function toSchedulerResult(item: { card: Parameters<typeof fromTsFsrsCard>[0]; log: { review: Date } }): ReviewSchedulerResult {
  return {
    card: fromTsFsrsCard(item.card),
    reviewed_at: item.log.review.toISOString()
  };
}

export function reviewGrade(payload: ReviewGradeRequest) {
  const reviewAt = new Date(payload.request.now);
  const grade = toRating(payload.request.rating);
  const next = getReviewScheduler().next(toTsFsrsCard(payload.request.card), reviewAt, grade);
  return toSchedulerResult(next);
}

export function reviewPreview(payload: ReviewPreviewRequest): ReviewPreviewResult {
  const reviewAt = new Date(payload.request.now);
  const preview = getReviewScheduler().repeat(toTsFsrsCard(payload.request.card), reviewAt);
  return {
    Again: toSchedulerResult(preview[Rating.Again]),
    Hard: toSchedulerResult(preview[Rating.Hard]),
    Good: toSchedulerResult(preview[Rating.Good]),
    Easy: toSchedulerResult(preview[Rating.Easy])
  };
}
