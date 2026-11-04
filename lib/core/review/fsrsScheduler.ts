import { Rating, type Grade } from 'ts-fsrs';

import { fsrsDefinition, reviewElapsedDays, type FsrsCard, type FsrsConfig, type FsrsResult, type FsrsScheduler } from './fsrsDefinition.js';
import type { SchedulerCard, SchedulerGradeResult, SchedulerPreviewResult } from './types.js';

export type SchedulerRating = 'Again' | 'Hard' | 'Good' | 'Easy';

export interface FsrsGradeRequest {
  nodeId?: string;
  desiredRetention?: number;
  card: SchedulerCard;
  enableShortTerm?: boolean;
  rating: SchedulerRating;
  now: string;
}

export interface FsrsPreviewRequest {
  nodeId?: string;
  desiredRetention?: number;
  card: SchedulerCard;
  enableShortTerm?: boolean;
  now: string;
}

export interface FsrsSchedulerRuntimeOverrides {
  desiredRetention?: number;
  enableShortTerm?: boolean;
}

export interface FsrsSchedulerSource<TSettings> {
  loadSettings: () => TSettings;
  getSettingsVersion: (settings: TSettings, overrides?: FsrsSchedulerRuntimeOverrides) => string;
  createParameters: (settings: TSettings, overrides?: FsrsSchedulerRuntimeOverrides) => FsrsConfig;
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

function toFsrsCard(card: SchedulerCard, nodeId = 'detached-review'): FsrsCard {
  return fsrsDefinition.schema.card.parse({
    cardId: nodeId,
    dueAt: new Date(card.due),
    lastReviewAt: card.state === 0 || !card.last_review ? null : new Date(card.last_review),
    state: card.state,
    scheduleStatus: card.state === 0 ? 'new' : card.state === 2 ? 'review' : 'learning',
    stability: card.stability,
    difficulty: card.difficulty,
    scheduledDays: card.scheduled_days,
    learningStep: 0,
    reps: card.reps,
    lapses: card.lapses
  });
}

function toSchedulerResult(item: FsrsResult): SchedulerGradeResult {
  const { card, revlog } = item;
  return {
    card: {
      due: card.dueAt.toISOString(),
      last_review: card.lastReviewAt?.toISOString() ?? null,
      state: card.state,
      stability: card.stability,
      difficulty: card.difficulty,
      elapsed_days: revlog.lastReviewAt ? reviewElapsedDays(revlog.lastReviewAt, revlog.reviewTime) : 0,
      scheduled_days: card.scheduledDays,
      reps: card.reps,
      lapses: card.lapses
    },
    reviewed_at: revlog.reviewTime.toISOString()
  };
}

export function createFsrsReviewScheduler<TSettings>(source: FsrsSchedulerSource<TSettings>) {
  let schedulerCache: { key: string; scheduler: FsrsScheduler } | null = null;

  function createRuntimeOverrides(request: FsrsSchedulerRuntimeOverrides): FsrsSchedulerRuntimeOverrides {
    return {
      ...(request.desiredRetention === undefined ? {} : { desiredRetention: request.desiredRetention }),
      ...(request.enableShortTerm === undefined ? {} : { enableShortTerm: request.enableShortTerm })
    };
  }

  function getScheduler(overrides?: FsrsSchedulerRuntimeOverrides) {
    const settings = source.loadSettings();
    const key = source.getSettingsVersion(settings, overrides);
    if (!schedulerCache || schedulerCache.key !== key) {
      schedulerCache = {
        key,
        scheduler: fsrsDefinition.create({ config: source.createParameters(settings, overrides) })
      };
    }
    return schedulerCache.scheduler;
  }

  return {
    grade(request: FsrsGradeRequest): SchedulerGradeResult {
      const reviewAt = new Date(request.now);
      const next = getScheduler(createRuntimeOverrides(request)).review({
        card: toFsrsCard(request.card, request.nodeId),
        now: reviewAt,
        grade: toRating(request.rating)
      });
      return toSchedulerResult(next);
    },
    preview(request: FsrsPreviewRequest): SchedulerPreviewResult {
      const reviewAt = new Date(request.now);
      const preview = getScheduler(createRuntimeOverrides(request)).preview({
        card: toFsrsCard(request.card, request.nodeId), now: reviewAt
      });
      const results = new Map([...preview].map(candidate => [candidate.grade, toSchedulerResult(candidate)]));
      return {
        Again: results.get(Rating.Again)!, Hard: results.get(Rating.Hard)!,
        Good: results.get(Rating.Good)!, Easy: results.get(Rating.Easy)!
      };
    }
  };
}
