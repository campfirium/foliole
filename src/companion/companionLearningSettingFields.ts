import type {
  ReviewSchedulerSettings,
  ReviewSchedulerSettingsSavePatch
} from '../../lib/core/review/settings';
import type { TranslationKey } from '../shared/localization/translations';

export interface CompanionLearningSettingField {
  key: string;
  label: TranslationKey;
  min: number;
  max?: number;
  step: number;
  read(settings: ReviewSchedulerSettings): number;
  patch(value: number, settings: ReviewSchedulerSettings): ReviewSchedulerSettingsSavePatch;
}

export const COMPANION_LEARNING_SETTING_FIELDS: readonly CompanionLearningSettingField[] = [
  { key: 'desiredRetention', label: 'settings.review.desiredRetention.aria', min: 0.01, max: 0.99, step: 0.01,
    read: value => value.desiredRetention, patch: desiredRetention => ({ desiredRetention }) },
  { key: 'maximumIntervalDays', label: 'settings.review.maximumInterval.aria', min: 1, step: 1,
    read: value => value.maximumIntervalDays, patch: maximumIntervalDays => ({ maximumIntervalDays }) },
  { key: 'newItemLoadBalancingDays', label: 'settings.review.newItemLoadBalancing.title', min: 1, max: 99, step: 1,
    read: value => value.newItemLoadBalancingDays, patch: newItemLoadBalancingDays => ({ newItemLoadBalancingDays }) },
  { key: 'newDayStartsAtHour', label: 'settings.review.newDayStartsAt.aria', min: 0, max: 23, step: 1,
    read: value => value.newDayStartsAtHour, patch: newDayStartsAtHour => ({ newDayStartsAtHour }) },
  { key: 'defaultPriority', label: 'settings.review.defaultPriority.aria', min: 1, max: 9, step: 1,
    read: value => value.pushQueue.defaultPriority, patch: defaultPriority => ({ pushQueue: { defaultPriority } }) },
  { key: 'priorityRatio', label: 'settings.review.priorityWeight.aria', min: 1, step: 0.01,
    read: value => value.pushQueue.priorityRatio, patch: priorityRatio => ({ pushQueue: { priorityRatio } }) },
  { key: 'queueMixReading', label: 'settings.review.readingQueueMix.aria', min: 1, step: 1,
    read: value => value.pushQueue.queueMixRatio.reading,
    patch: reading => ({ pushQueue: { queueMixRatio: { reading } } }) },
  { key: 'queueMixFsrs', label: 'settings.review.itemQueueMix.aria', min: 1, step: 1,
    read: value => value.pushQueue.queueMixRatio.fsrs,
    patch: fsrs => ({ pushQueue: { queueMixRatio: { fsrs } } }) },
  { key: 'readingInitialIntervalDays', label: 'settings.review.readingInitialInterval.aria', min: 0.01, step: 0.01,
    read: value => value.pushQueue.readingInitialIntervalMs / 86_400_000,
    patch: days => ({ pushQueue: { readingInitialIntervalMs: Math.round(days * 86_400_000) } }) },
  { key: 'readingGrowthMin', label: 'settings.review.readingGrowthMin.aria', min: 1, step: 0.01,
    read: value => value.pushQueue.readingIntervalGrowthFactorRange.min,
    patch: (min, settings) => ({ pushQueue: { readingIntervalGrowthFactorRange: {
      min, max: Math.max(min, settings.pushQueue.readingIntervalGrowthFactorRange.max)
    } } }) },
  { key: 'readingGrowthMax', label: 'settings.review.readingGrowthMax.aria', min: 1, step: 0.01,
    read: value => value.pushQueue.readingIntervalGrowthFactorRange.max,
    patch: (max, settings) => ({ pushQueue: { readingIntervalGrowthFactorRange: {
      min: Math.min(max, settings.pushQueue.readingIntervalGrowthFactorRange.min), max
    } } }) }
];
