import { readForegroundTimeHistory } from '../../lib/core/database/foregroundTimeHistory.js';
import type { ForegroundTimeHistoryArgs } from '../../lib/platform/nativeForegroundTimeContract.js';
import { desktopForegroundTimeSnapshot } from '../foregroundTimeRuntime.js';
import { loadReviewSchedulerSettings } from '../reviewSchedulerSettings.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { openDatabaseConnection } from './connection.js';

export function loadForegroundTimeHistory(args: ForegroundTimeHistoryArgs) {
  return readForegroundTimeHistory(createBetterSqliteDbPort(openDatabaseConnection().sqlite), args,
    loadReviewSchedulerSettings().newDayStartsAtHour, desktopForegroundTimeSnapshot());
}
