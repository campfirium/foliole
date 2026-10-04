import { render, type RenderOptions } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';

import { ExternalFoldersSettingsProvider } from '../../features/settings/context/ExternalFoldersSettingsProvider';
import { ReviewSchedulerSettingsContext } from '../../features/settings/context/reviewSchedulerSettingsContext';
import { DEFAULT_REVIEW_SCHEDULER_SETTINGS } from '../../features/settings/model/reviewSchedulerSettings';

import { LocalizationProvider } from './LocalizationProvider';

const ignoreSettingChange = () => undefined;
const reviewSettings = {
  isReviewSchedulerSettingsReady: true,
  reviewSchedulerSettings: DEFAULT_REVIEW_SCHEDULER_SETTINGS,
  onDefaultPriorityChange: ignoreSettingChange,
  onDesiredRetentionChange: ignoreSettingChange,
  onEnableShortTermChange: ignoreSettingChange,
  onMaximumIntervalDaysChange: ignoreSettingChange,
  onNewDayStartsAtHourChange: ignoreSettingChange,
  onNewItemLoadBalancingDaysChange: ignoreSettingChange,
  onPriorityRatioChange: ignoreSettingChange,
  onQueueMixRatioFsrsChange: ignoreSettingChange,
  onQueueMixRatioReadingChange: ignoreSettingChange,
  onReadingInitialIntervalDaysChange: ignoreSettingChange,
  onReadingIntervalGrowthFactorMaxChange: ignoreSettingChange,
  onReadingIntervalGrowthFactorMinChange: ignoreSettingChange
};

export function TestReviewSchedulerSettingsProvider({ children }: { children: ReactNode }) {
  return <ReviewSchedulerSettingsContext.Provider value={reviewSettings}>{children}</ReviewSchedulerSettingsContext.Provider>;
}

export function renderWithLocalization(ui: ReactElement, options?: RenderOptions) {
  return render(ui, {
    wrapper: ({ children }) => (
      <LocalizationProvider>
        <ExternalFoldersSettingsProvider>
          <TestReviewSchedulerSettingsProvider>{children}</TestReviewSchedulerSettingsProvider>
        </ExternalFoldersSettingsProvider>
      </LocalizationProvider>
    ),
    ...options
  });
}
