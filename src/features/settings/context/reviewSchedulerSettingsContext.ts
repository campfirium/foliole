import { createContext, useContext } from 'react';

import type { ReviewSchedulerSettings } from '../model/reviewSchedulerSettings';

export interface ReviewSchedulerSettingsContextValue {
  isReviewSchedulerSettingsReady: boolean;
  reviewSchedulerSettings: ReviewSchedulerSettings;
  onDefaultPriorityChange: (value: number) => void;
  onDesiredRetentionChange: (value: number) => void;
  onEnableShortTermChange: (value: boolean) => void;
  onMaximumIntervalDaysChange: (value: number) => void;
  onNewDayStartsAtHourChange: (value: number) => void;
  onPriorityRatioChange: (value: number) => void;
  onQueueMixRatioFsrsChange: (value: number) => void;
  onQueueMixRatioReadingChange: (value: number) => void;
  onReadingInitialIntervalDaysChange: (value: number) => void;
  onReadingIntervalGrowthFactorMaxChange: (value: number) => void;
  onReadingIntervalGrowthFactorMinChange: (value: number) => void;
}

export const ReviewSchedulerSettingsContext = createContext<ReviewSchedulerSettingsContextValue | null>(null);

export function useReviewSchedulerSettings() {
  const context = useContext(ReviewSchedulerSettingsContext);
  if (!context) {
    throw new Error('ReviewSchedulerSettingsProvider is missing.');
  }
  return context;
}
