import assert from 'node:assert/strict';
import path from 'node:path';

import Database from 'better-sqlite3';

import { COMPANION_SCHEMA_STATEMENTS } from '../../lib/core/database/companionSchemaStatements.js';
import { DESKTOP_FRESH_SCHEMA_STATEMENTS } from '../../lib/core/database/desktopFreshSchemaStatements.js';
import { readForegroundTimeHistory } from '../../lib/core/database/foregroundTimeHistory.js';
import { saveForegroundTime } from '../../lib/core/database/foregroundTimeStore.js';
import { createDailyFlowDayWindow, dailyFlowSettingsForInstant } from '../../lib/core/flow/dailyFlowDayWindow.js';
import { readDailyFlow, saveCycleFlow } from '../../lib/core/flow/dailyFlowStorage.js';
import { ForegroundTimeCounter, splitForegroundTime } from '../../lib/core/review/foregroundTime.js';
import { calendarDateKey, reviewCalendarDayKey } from '../../lib/core/review/reviewCalendarDates.js';
import { resolveCurrentDayStart, resolveReadingAvailableAt, resolveScheduledDayStart } from '../../lib/core/review/reviewDayBoundary.js';
import { DEFAULT_REVIEW_SCHEDULER_SETTINGS } from '../../lib/core/review/settings.js';
import { iosCompanionContentHash, markIosCompanionMutation } from '../../src/shared/platform/companion/runtime/iosCompanionMutationState.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';

function verifyDay(month: number, day: number, hour: number) {
  const boundary = new Date(2026, month, day, hour);
  const previous = new Date(2026, month, day - 1, hour);
  for (const delta of [-1, 0, 1, 30 * 60_000]) {
    const now = new Date(boundary.getTime() + delta);
    assert.equal(resolveCurrentDayStart(now, hour).getTime(), delta < 0 ? previous.getTime() : boundary.getTime());
    assert.equal(reviewCalendarDayKey(now, hour), calendarDateKey(delta < 0 ? previous : boundary));
  }
  const now = boundary.toISOString();
  const next = new Date(2026, month, day + 1, hour).toISOString();
  assert.equal(resolveScheduledDayStart({ reviewedAt: now, scheduledDays: 1, newDayStartsAtHour: hour }).toISOString(), next);
  assert.deepEqual(createDailyFlowDayWindow(now, hour), { start: now, end: next });
  assert.equal(resolveReadingAvailableAt({ lastHandledAt: previous.toISOString(), nextAt: now, newDayStartsAtHour: hour }), now);
}

async function persistDay(root: string, schema: readonly string[], name: string, month: number, day: number) {
  const file = path.join(root, `${name}-${month}-${day}.db`);
  let sql = new Database(file);
  sql.exec(schema.join(';\n'));
  const sourceId = '11111111-1111-4111-8111-111111111111';
  const boundary = new Date(2026, month, day, 4);
  const clock = { wallMs: boundary.getTime() - 30_000, monotonicMs: 0 };
  const counter = new ForegroundTimeCounter(() => ({ ...clock }));
  counter.setActive(true, 4);
  clock.wallMs += 60_000; clock.monotonicMs += 60_000;
  const expected = [{ day: calendarDateKey(new Date(2026, month, day - 1)), durationMs: 30_000 },
    { day: calendarDateKey(boundary), durationMs: 30_000 }];
  const buckets = counter.checkpoint();
  assert.deepEqual(buckets, expected);
  let port = createBetterSqliteDbPort(sql);
  const save = () => saveForegroundTime(port, { sourceId, buckets, hash: iosCompanionContentHash,
    mark: (tx, record) => markIosCompanionMutation({ db: tx, hostName: name, objectType: 'foreground_source',
      objectId: record.id, contentHash: record.hash, updatedAt: record.updatedAt }) });
  await save(); await save();
  const settings = { newDayStartsAtHour: 4, pushQueue: DEFAULT_REVIEW_SCHEDULER_SETTINGS.pushQueue };
  const now = boundary.toISOString();
  const window = createDailyFlowDayWindow(now, 4);
  const session = { currentNodeId: null, isAnswerRevealed: false, queueNodeIds: [], totalNodeCount: 0,
    cycle: { clearKey: 0, clearedAt: null, scanAfter: 0, lapLimit: 0, tailKey: 0, remaining: 0, reviewRemaining: 0 } };
  await saveCycleFlow(port, { dayKey: window.start, mode: 'recommended', settingsKey: JSON.stringify({ ...settings, dayWindow: window }),
    now, revision: 1, session });
  sql.close(); sql = new Database(file); port = createBetterSqliteDbPort(sql);
  try {
    const history = await readForegroundTimeHistory(port, { fromDay: expected[0]!.day,
      toDay: calendarDateKey(new Date(2026, month, day + 1)) }, 4);
    assert.equal(history.totalDurationMs, 60_000);
    assert.deepEqual(history.days.sort((a, b) => a.day.localeCompare(b.day)), expected);
    assert.deepEqual((await readDailyFlow(port))!.session.dayWindow, window);
    assert.deepEqual((await dailyFlowSettingsForInstant(port, settings, new Date(boundary.getTime() + 60_000).toISOString())).dayWindow, window);
    const resumed = new ForegroundTimeCounter(() => ({ ...clock }), buckets);
    resumed.setActive(true, 4); clock.wallMs += 10_000; clock.monotonicMs += 10_000;
    assert.deepEqual(resumed.checkpoint(), [expected[0], { ...expected[1], durationMs: 40_000 }]);
  } finally { sql.close(); }
}

export async function verifyReviewDayBoundary(root: string) {
  for (const [month, day] of [[2, 8], [10, 1], [2, 9]] as const) {
    for (const hour of [0, 1, 2, 4, 23]) verifyDay(month, day, hour);
    for (const [name, schema] of [['desktop', DESKTOP_FRESH_SCHEMA_STATEMENTS], ['companion', COMPANION_SCHEMA_STATEMENTS]] as const) {
      await persistDay(root, schema, name, month, day);
    }
  }
  for (const [month, day] of [[2, 8], [10, 1]] as const) {
    const start = new Date(2026, month, day - 1, 4);
    const boundary = new Date(2026, month, day, 4);
    const end = new Date(2026, month, day + 1, 4);
    assert.deepEqual(splitForegroundTime(start.getTime(), end.getTime() - start.getTime(), 4), [
      { day: calendarDateKey(start), durationMs: boundary.getTime() - start.getTime() },
      { day: calendarDateKey(boundary), durationMs: end.getTime() - boundary.getTime() }
    ]);
  }
  if (Intl.DateTimeFormat().resolvedOptions().timeZone === 'America/New_York') {
    for (const offset of ['-04:00', '-05:00']) {
      assert.equal(resolveCurrentDayStart(new Date(`2026-11-01T01:30:00${offset}`), 1).toISOString(), '2026-11-01T05:00:00.000Z');
    }
  }
  return { zone: Intl.DateTimeFormat().resolvedOptions().timeZone, verified: true };
}
