import { useSyncExternalStore } from 'react';

import { getCurrentReviewSchedulerSettings, subscribeReviewSchedulerSettings } from '../../features/settings/model/reviewSchedulerSettings';
import { useTranslation } from '../localization/LocalizationProvider';

export function useFixedLaterHint() {
  const t = useTranslation();
  const { readingLaterDays: days } = useSyncExternalStore(subscribeReviewSchedulerSettings, getCurrentReviewSchedulerSettings);
  if (!days) return null;
  return t(days === 1 ? 'desktop.reviewActions.reading.laterOneDay' : 'desktop.reviewActions.reading.laterDays', { days });
}
