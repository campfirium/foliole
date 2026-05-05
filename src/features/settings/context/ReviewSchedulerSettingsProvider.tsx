import { useEffect, useMemo, useState, type ReactNode } from 'react';

import { createReviewActions } from '../../../app/hooks/reviewSettingsLayoutActions';
import {
  DEFAULT_REVIEW_SCHEDULER_SETTINGS,
  loadReviewSchedulerSettings,
  type ReviewSchedulerSettings
} from '../model/reviewSchedulerSettings';

import {
  ReviewSchedulerSettingsContext,
  useReviewSchedulerSettings
} from './reviewSchedulerSettingsContext';

function useReviewSchedulerSettingsState() {
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

function useReviewSchedulerSettingsValue() {
  const state = useReviewSchedulerSettingsState();

  return useMemo(
    () => ({
      reviewSchedulerSettings: state.reviewSchedulerSettings,
      ...createReviewActions({ reviewSettings: state })
    }),
    [state.reviewSchedulerSettings]
  );
}

export function ReviewSchedulerSettingsProvider({ children }: { children: ReactNode }) {
  const value = useReviewSchedulerSettingsValue();
  return (
    <ReviewSchedulerSettingsContext.Provider value={value}>
      {children}
    </ReviewSchedulerSettingsContext.Provider>
  );
}

export { useReviewSchedulerSettings };
