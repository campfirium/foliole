import { resolveCurrentDayStart } from '../review/reviewDayBoundary.js';
import type { DbPort } from '../sync/dbPort.js';

import type { DailyFlowSettings } from './dailyFlowContract.js';
import { readDailyFlow } from './dailyFlowStorage.js';

export interface DailyFlowDayWindow { start: string; end: string }

export function containsFlowInstant(window: DailyFlowDayWindow, now: string) {
  return Date.parse(window.start) <= Date.parse(now) && Date.parse(now) < Date.parse(window.end);
}

export function createDailyFlowDayWindow(now: string, hour: number): DailyFlowDayWindow {
  const start = resolveCurrentDayStart(new Date(now), hour);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

/** The creator fixes the interval; a receiving host does not reinterpret its timezone. */
export async function dailyFlowSettingsForInstant(db: DbPort, settings: DailyFlowSettings, now: string, history = false) {
  const stored = await readDailyFlow(db);
  const window = stored?.session.dayWindow ?? settings.dayWindow;
  return { ...settings, dayWindow: window && (history || containsFlowInstant(window, now)) ? window
    : createDailyFlowDayWindow(now, settings.newDayStartsAtHour) };
}
