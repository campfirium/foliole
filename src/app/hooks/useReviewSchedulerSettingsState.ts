import { useEffect, useState } from 'react';

import {
  DEFAULT_REVIEW_SCHEDULER_SETTINGS,
  loadReviewSchedulerSettings,
  type ReviewSchedulerSettings
} from '../../features/settings/model/reviewSchedulerSettings';

export function useReviewSchedulerSettingsState() {
  const [reviewSchedulerSettings, setReviewSchedulerSettingsState] =
    useState<ReviewSchedulerSettings>(DEFAULT_REVIEW_SCHEDULER_SETTINGS);

  useEffect(() => {
    let active = true;
    void loadReviewSchedulerSettings().then((settings) => {
      if (active) {
        setReviewSchedulerSettingsState(settings);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  return {
    reviewSchedulerSettings,
    setReviewSchedulerSettingsState
  };
}
