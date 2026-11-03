import type { ReviewSchedulerSettings, ReviewSchedulerSettingsSavePatch } from '../../lib/core/review/settings';
import type { TranslationKey } from '../shared/localization/translations';

import { COMPANION_LEARNING_SETTING_FIELDS } from './companionLearningSettingFields';

export interface CompanionLearningSettingRow {
  key: string;
  title: TranslationKey;
  description: TranslationKey;
  fields: string[];
}

export const COMPANION_LEARNING_SETTING_ROWS: readonly CompanionLearningSettingRow[] = [
  { key: 'desiredRetention', title: 'settings.search.reviewRetention.title', description: 'settings.review.desiredRetention.description', fields: ['desiredRetention'] },
  { key: 'maximumIntervalDays', title: 'settings.search.reviewMaximumInterval.title', description: 'settings.review.maximumInterval.description', fields: ['maximumIntervalDays'] },
  { key: 'newItemLoadBalancingDays', title: 'settings.review.newItemLoadBalancing.title', description: 'settings.review.newItemLoadBalancing.description', fields: ['newItemLoadBalancingDays'] },
  { key: 'newDayStartsAtHour', title: 'settings.search.reviewDayStart.title', description: 'settings.search.reviewDayStart.description', fields: ['newDayStartsAtHour'] },
  { key: 'defaultPriority', title: 'settings.search.reviewDefaultPriority.title', description: 'settings.search.reviewDefaultPriority.description', fields: ['defaultPriority'] },
  { key: 'priorityRatio', title: 'settings.search.reviewPriorityWeight.title', description: 'settings.search.reviewPriorityWeight.description', fields: ['priorityRatio'] },
  { key: 'queueMix', title: 'settings.search.reviewMix.title', description: 'settings.search.reviewMix.description', fields: ['queueMixReading', 'queueMixFsrs'] },
  { key: 'readingInitialIntervalDays', title: 'settings.search.reviewInitialInterval.title', description: 'settings.search.reviewInitialInterval.description', fields: ['readingInitialIntervalDays'] },
  { key: 'readingGrowth', title: 'settings.search.reviewIntervalGrowth.title', description: 'settings.search.reviewIntervalGrowth.description', fields: ['readingGrowthMin', 'readingGrowthMax'] }
];

export function getLearningRowFields(row: CompanionLearningSettingRow) {
  return row.fields.map(key => COMPANION_LEARNING_SETTING_FIELDS.find(field => field.key === key)!);
}

export function getLearningRowPatch(row: CompanionLearningSettingRow, values: number[], settings: ReviewSchedulerSettings): ReviewSchedulerSettingsSavePatch {
  if (row.key === 'queueMix') return { pushQueue: { queueMixRatio: { reading: values[0]!, fsrs: values[1]! } } };
  if (row.key === 'readingGrowth') return { pushQueue: { readingIntervalGrowthFactorRange: { min: values[0]!, max: values[1]! } } };
  return getLearningRowFields(row)[0]!.patch(values[0]!, settings);
}

export function formatLearningRowValue(row: CompanionLearningSettingRow, settings: ReviewSchedulerSettings, rangeTo: string) {
  const values = getLearningRowFields(row).map(field => field.read(settings));
  if (row.key === 'newDayStartsAtHour') return `${String(values[0]).padStart(2, '0')}:00`;
  if (row.key === 'defaultPriority') return `P${values[0]}`;
  if (row.key === 'queueMix') return values.join(' : ');
  if (row.key === 'readingGrowth') return values.join(` ${rangeTo} `);
  return String(values[0]);
}
