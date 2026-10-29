import { resolveCurrentDayStart, resolveNextDayStart } from '../review/reviewDayBoundary.js';
import type { DbPort } from '../sync/dbPort.js';

import type { DailyFlowSettings } from './dailyFlowContract.js';
import { readDailyFlow } from './dailyFlowStorage.js';
import type { CycleStored } from './dailyFlowStore.js';

export interface DailyFlowDayWindow { start: string; end: string }

export function isFlowWindowUnexpired(window: DailyFlowDayWindow, now: string) {
  // Receiving a known day does not require this device clock to have reached its creator start.
  return Date.parse(now) < Date.parse(window.end);
}

export function createDailyFlowDayWindow(now: string, hour: number): DailyFlowDayWindow {
  const start = resolveCurrentDayStart(new Date(now), hour);
  const end = resolveNextDayStart(new Date(now), hour);
  return { start: start.toISOString(), end: end.toISOString() };
}

/** The creator fixes the interval; a receiving host does not reinterpret its timezone. */
export async function dailyFlowSettingsForInstant(db: DbPort, settings: DailyFlowSettings, now: string, history = false, current?: CycleStored | null) {
  const stored = current === undefined ? await readDailyFlow(db) : current;
  const window = stored?.session.dayWindow ?? settings.dayWindow;
  return { ...settings, dayWindow: window && (history || isFlowWindowUnexpired(window, now)) ? window
    : createDailyFlowDayWindow(now, settings.newDayStartsAtHour) };
}
