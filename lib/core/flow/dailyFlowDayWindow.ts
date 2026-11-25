import { resolveCurrentDayStart, resolveNextDayStart } from '../review/reviewDayBoundary.js';
import { activeReviewDayWindow } from '../review/reviewReadiness.js';
import type { DbPort } from '../sync/dbPort.js';

import type { DailyFlowSettings } from './dailyFlowContract.js';
import { readDailyFlow } from './dailyFlowStorage.js';
import type { CycleStored } from './dailyFlowStore.js';

export interface DailyFlowDayWindow { start: string; end: string }

export function isFlowWindowUnexpired(window: DailyFlowDayWindow, now: string) {
  // Receiving a known day does not require this device clock to have reached its creator start.
  return Boolean(activeReviewDayWindow(window, now));
}

export function createDailyFlowDayWindow(now: string, hour: number): DailyFlowDayWindow {
  const start = resolveCurrentDayStart(new Date(now), hour);
  const end = resolveNextDayStart(new Date(now), hour);
  return { start: start.toISOString(), end: end.toISOString() };
}

export function differsFromStoredFlowWindow(stored: CycleStored, settings: DailyFlowSettings) {
  const previous = stored.session.dayWindow;
  const next = settings.dayWindow;
  return Boolean(previous && next && (previous.start !== next.start || previous.end !== next.end));
}

/** Keep the active interval until the device changes its learning-day hour or the interval expires. */
export async function dailyFlowSettingsForInstant(db: DbPort, settings: DailyFlowSettings, now: string, history = false, current?: CycleStored | null) {
  const stored = current === undefined ? await readDailyFlow(db) : current;
  const window = stored?.session.dayWindow ?? settings.dayWindow;
  const savedHour = stored ? (JSON.parse(stored.settings_key) as DailyFlowSettings).newDayStartsAtHour : undefined;
  const hourChanged = savedHour !== undefined && savedHour !== settings.newDayStartsAtHour;
  if (window && (history || (!hourChanged && isFlowWindowUnexpired(window, now)))) {
    return { ...settings, newDayStartsAtHour: history ? savedHour ?? settings.newDayStartsAtHour : settings.newDayStartsAtHour,
      dayWindow: window };
  }
  return { ...settings, dayWindow: createDailyFlowDayWindow(now, settings.newDayStartsAtHour) };
}
