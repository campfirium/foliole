import { readReviewCalendarHistory } from '../../lib/core/database/reviewCalendarHistory.js';
import { readReviewCalendarSchedule } from '../../lib/core/database/reviewCalendarSchedule.js';
import type { NativeReviewCalendar, NativeReviewCalendarHistoryArgs } from '../../lib/platform/nativeReviewCalendarContract.js';
import { loadReviewSchedulerSettings } from '../reviewSchedulerSettings.js';

import { openDatabaseConnection } from './connection.js';

export function loadReviewCalendarHistory(args: NativeReviewCalendarHistoryArgs & { now: string }): NativeReviewCalendar {
  const hour = loadReviewSchedulerSettings().newDayStartsAtHour;
  return openDatabaseConnection().driver.transaction(driver => ({
    ...readReviewCalendarHistory(driver, args, hour),
    scheduledDays: readReviewCalendarSchedule(driver, args.now, hour)
  }));
}
