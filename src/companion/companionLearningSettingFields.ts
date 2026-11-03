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
    read: value => value.newDayStartsAtHour, patch: newDayStartsAtHour => ({ newDayStartsAtHour }) }
];
