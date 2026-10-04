// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { createBetterSqliteDbPort } from '../../../../../electron/database/betterSqliteDbPort';
import { COMPANION_SCHEMA_STATEMENTS } from '../../../../../lib/core/database/companionSchemaStatements';


const lifecycle = vi.hoisted(() => ({ foreground: () => {}, background: () => {}, active: true }));
vi.mock('../../appLifecycle', () => ({
  readNativeAppActiveState: async () => lifecycle.active,
  subscribeNativeAppForeground: async (handler: () => void) => { lifecycle.foreground = handler; return () => {}; },
  subscribeNativeAppBackground: async (handler: () => void) => { lifecycle.background = handler; return () => {}; }
}));

import { companionForegroundTimeSnapshot, flushCompanionForegroundTime, startCompanionForegroundTime, stopCompanionForegroundTime } from './companionForegroundTime';

let db: Database.Database;
function owner() {
  const port = createBetterSqliteDbPort(db);
  // Replace only the native connection owner boundary; all counting and persistence SQL is production code.
  return { runWriter: <T>(task: (db: typeof port) => Promise<T>) => task(port) };
}
beforeEach(() => {
  lifecycle.active = true;
  vi.useFakeTimers({ toFake: ['Date', 'performance', 'setInterval', 'clearInterval'] });
  vi.setSystemTime(new Date(2026, 9, 4, 12));
  db = new Database(':memory:');
  for (const statement of COMPANION_SCHEMA_STATEMENTS) db.exec(statement);
  db.exec("INSERT INTO companion_meta(key, value, updated_at) VALUES ('host_name','mobile','2026-10-04')");
});
afterEach(async () => { await stopCompanionForegroundTime(); vi.clearAllTimers(); vi.useRealTimers(); db.close(); });
function total() { return db.prepare('SELECT COALESCE(SUM(duration_ms), 0) total FROM foreground_daily_time').get(); }

it('records passive mobile foreground reading, ignores duplicate resume and stops when backgrounded', async () => {
  await startCompanionForegroundTime(owner());
  await vi.advanceTimersByTimeAsync(30_000); lifecycle.foreground();
  await vi.advanceTimersByTimeAsync(30_000); await flushCompanionForegroundTime();
  expect(total()).toEqual({ total: 60_000 });
  await vi.advanceTimersByTimeAsync(5_000); lifecycle.background(); lifecycle.background();
  await flushCompanionForegroundTime(); expect(total()).toEqual({ total: 65_000 });
  const seq = db.prepare('SELECT state_seq FROM sync_object_state').get();
  await vi.advanceTimersByTimeAsync(600_000); expect(total()).toEqual({ total: 65_000 });
  expect(db.prepare('SELECT state_seq FROM sync_object_state').get()).toEqual(seq);
  lifecycle.foreground(); await vi.advanceTimersByTimeAsync(5_000);
  await stopCompanionForegroundTime(); expect(total()).toEqual({ total: 70_000 });
});

it('starts inactive without counting the time before the App resumes', async () => {
  lifecycle.active = false;
  await startCompanionForegroundTime(owner());
  await vi.advanceTimersByTimeAsync(600_000); expect(total()).toEqual({ total: 0 });
  lifecycle.foreground(); await vi.advanceTimersByTimeAsync(60_000);
  await flushCompanionForegroundTime(); expect(total()).toEqual({ total: 60_000 });
});

it('keeps saved history on restart and never adds the background interval', async () => {
  const firstOwner = owner(); await startCompanionForegroundTime(firstOwner);
  await vi.advanceTimersByTimeAsync(60_000); await flushCompanionForegroundTime();
  const originalSource = companionForegroundTimeSnapshot()!.sourceId;
  await stopCompanionForegroundTime(); await vi.advanceTimersByTimeAsync(600_000);
  await startCompanionForegroundTime(owner());
  expect(companionForegroundTimeSnapshot()!.sourceId).not.toBe(originalSource);
  await vi.advanceTimersByTimeAsync(10_000); await flushCompanionForegroundTime();
  expect(total()).toEqual({ total: 70_000 });
});
