import { dateChrono, defineScheduler } from 'ts-fsrs';
import {
  schedulerDesiredRetentionMiddleware, schedulerFuzzingMiddleware,
  schedulerLearningStepsMiddleware, schedulerMaximumIntervalMiddleware,
  schedulerMonotonicIntervalMiddleware, schedulerScheduledDaysMiddleware,
  schedulerStatsMiddleware
} from 'ts-fsrs/middlewares';
import { FSRS6Model } from 'ts-fsrs/models/fsrs-6';

const chrono = dateChrono.create({ config: { fractionalDays: false } });

/** Match v5's actual scheduler: UTC calendar days, clamped for early reviews. */
export function reviewElapsedDays(previous: Date, current: Date) {
  return Math.max(0, chrono.difference(previous, current));
}

export const fsrsDefinition = defineScheduler({ model: FSRS6Model, chrono: dateChrono }).use(
  schedulerDesiredRetentionMiddleware,
  schedulerFuzzingMiddleware,
  schedulerStatsMiddleware,
  schedulerScheduledDaysMiddleware,
  schedulerLearningStepsMiddleware,
  schedulerMaximumIntervalMiddleware,
  schedulerMonotonicIntervalMiddleware
);

export type FsrsScheduler = ReturnType<typeof fsrsDefinition.create>;
export type FsrsConfig = Parameters<typeof fsrsDefinition.create>[0]['config'];
export type FsrsCard = ReturnType<FsrsScheduler['newCard']>;
export type FsrsResult = ReturnType<FsrsScheduler['review']>;
