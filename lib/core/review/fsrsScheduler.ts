import { Rating, fsrs, type FSRS, type Grade } from 'ts-fsrs';

import type { SchedulerCard, SchedulerGradeResult, SchedulerPreviewResult } from './types.js';

export type SchedulerRating = 'Again' | 'Hard' | 'Good' | 'Easy';

export interface FsrsGradeRequest {
  card: SchedulerCard;
  enableShortTerm?: boolean;
  rating: SchedulerRating;
  now: string;
}

export interface FsrsPreviewRequest {
  card: SchedulerCard;
  enableShortTerm?: boolean;
  now: string;
}

export interface FsrsSchedulerRuntimeOverrides {
  enableShortTerm?: boolean;
}

export interface FsrsSchedulerSource<TSettings> {
  loadSettings: () => TSettings;
  getSettingsVersion: (settings: TSettings, overrides?: FsrsSchedulerRuntimeOverrides) => string;
  createParameters: (settings: TSettings, overrides?: FsrsSchedulerRuntimeOverrides) => Parameters<typeof fsrs>[0];
}

interface FsrsCardSnapshot {
  due: Date;
  last_review?: Date;
  state: SchedulerCard['state'];
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
}

function toRating(value: SchedulerRating): Grade {
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

function toFsrsCard(card: SchedulerCard): FsrsCardSnapshot {
  return {
    due: new Date(card.due),
    ...(card.last_review ? { last_review: new Date(card.last_review) } : {}),
    state: card.state,
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    learning_steps: 0,
    reps: card.reps,
    lapses: card.lapses
  };
}

function fromFsrsCard(card: FsrsCardSnapshot): SchedulerCard {
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

function toSchedulerResult(item: {
  card: FsrsCardSnapshot;
  log: { review: Date };
}): SchedulerGradeResult {
  return {
    card: fromFsrsCard(item.card),
    reviewed_at: item.log.review.toISOString()
  };
}

export function createFsrsReviewScheduler<TSettings>(source: FsrsSchedulerSource<TSettings>) {
  let schedulerCache: { key: string; scheduler: FSRS } | null = null;

  function createRuntimeOverrides(request: { enableShortTerm?: boolean }): FsrsSchedulerRuntimeOverrides | undefined {
    return request.enableShortTerm === undefined ? undefined : { enableShortTerm: request.enableShortTerm };
  }

  function getScheduler(overrides?: FsrsSchedulerRuntimeOverrides) {
    const settings = source.loadSettings();
    const key = source.getSettingsVersion(settings, overrides);
    if (!schedulerCache || schedulerCache.key !== key) {
      schedulerCache = {
        key,
        scheduler: fsrs(source.createParameters(settings, overrides))
      };
    }
    return schedulerCache.scheduler;
  }

  return {
    grade(request: FsrsGradeRequest): SchedulerGradeResult {
      const reviewAt = new Date(request.now);
      const next = getScheduler(createRuntimeOverrides(request)).next(
        toFsrsCard(request.card),
        reviewAt,
        toRating(request.rating)
      );
      return toSchedulerResult(next);
    },
    preview(request: FsrsPreviewRequest): SchedulerPreviewResult {
      const reviewAt = new Date(request.now);
      const preview = getScheduler(createRuntimeOverrides(request)).repeat(toFsrsCard(request.card), reviewAt);
      return {
        Again: toSchedulerResult(preview[Rating.Again]),
        Hard: toSchedulerResult(preview[Rating.Hard]),
        Good: toSchedulerResult(preview[Rating.Good]),
        Easy: toSchedulerResult(preview[Rating.Easy])
      };
    }
  };
}
