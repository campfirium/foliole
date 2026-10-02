import { readReviewCalendarHistory } from '../../lib/core/database/reviewCalendarHistory.js';
import type { NativeReviewCalendarHistoryArgs } from '../../lib/platform/nativeReviewCalendarContract.js';
import { loadReviewSchedulerSettings } from '../reviewSchedulerSettings.js';

import { openDatabaseConnection } from './connection.js';

export function loadReviewCalendarHistory(args: NativeReviewCalendarHistoryArgs) {
  return readReviewCalendarHistory(openDatabaseConnection().driver, args,
    loadReviewSchedulerSettings().newDayStartsAtHour);
}
