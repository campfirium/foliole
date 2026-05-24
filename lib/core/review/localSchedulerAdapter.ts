import { createFsrsReviewScheduler } from './fsrsScheduler.js';
import {
  createReviewSchedulerParameters,
  DEFAULT_REVIEW_SCHEDULER_SETTINGS,
  getReviewSchedulerVersion,
  type ReviewSchedulerSettings
} from './settings.js';
import {
  mapGradeToRustRating,
  type ReviewSchedulerAdapter,
  type SchedulerGradeResult,
  type SchedulerPreviewInput,
  type SchedulerPreviewResult
} from './types.js';

export interface LocalReviewSchedulerAdapterOptions {
  loadSettings?: () => ReviewSchedulerSettings;
}

export function createLocalReviewSchedulerAdapter(options: LocalReviewSchedulerAdapterOptions = {}): ReviewSchedulerAdapter {
  const scheduler = createFsrsReviewScheduler({
    loadSettings: options.loadSettings ?? (() => DEFAULT_REVIEW_SCHEDULER_SETTINGS),
    getSettingsVersion: getReviewSchedulerVersion,
    createParameters: createReviewSchedulerParameters
  });

  return {
    grade: async (input): Promise<SchedulerGradeResult> => {
      return scheduler.grade({
        card: input.card,
        ...(input.enableShortTerm === undefined ? {} : { enableShortTerm: input.enableShortTerm }),
        rating: mapGradeToRustRating(input.grade),
        now: input.now
      });
    },
    preview: async (input: SchedulerPreviewInput): Promise<SchedulerPreviewResult> => {
      return scheduler.preview(input);
    }
  };
}
