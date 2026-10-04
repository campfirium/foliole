// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { DESKTOP_FRESH_SCHEMA_STATEMENTS } from '../lib/core/database/desktopFreshSchemaStatements.js';

import { createBetterSqlite3Driver } from './database/betterSqlite3Driver.js';

const native = vi.hoisted(() => ({ app: new Map<string, (() => void)[]>(), power: new Map<string, (() => void)[]>(),
  focused: true, ready: [] as (() => void)[], cleanup: [] as (() => void)[], connection: null as unknown, hour: 4 }));
vi.mock('electron', () => ({
  app: { on: (event: string, callback: () => void) => native.app.set(event, [...(native.app.get(event) ?? []), callback]) },
  powerMonitor: { on: (event: string, callback: () => void) => native.power.set(event, [...(native.power.get(event) ?? []), callback]) },
  BrowserWindow: { getFocusedWindow: () => native.focused ? {} : null }
}));
vi.mock('./database/connection.js', () => ({ openDatabaseConnection: () => native.connection,
  registerDatabaseConnectionReady: (callback: () => void) => native.ready.push(callback),
  registerDatabaseConnectionCleanup: (callback: () => void) => native.cleanup.push(callback) }));
vi.mock('./database/desktopDatabaseWriteQueue.js', () => ({ runDesktopDatabaseWrite: async (_: string, execute: () => void) => execute() }));
vi.mock('./database/hostProfile.js', () => ({ loadOrCreateDesktopHostName: () => 'desktop' }));
vi.mock('./reviewSchedulerSettings.js', () => ({ loadReviewSchedulerSettings: () => ({ newDayStartsAtHour: native.hour }), subscribeReviewDayBoundary: () => () => {} }));
vi.mock('./diagnostics/mainProcessDiagnostics.js', () => ({ appendMainProcessDiagnosticLog: vi.fn() }));

let sqlite: Database.Database;
beforeEach(() => {
  vi.resetModules(); native.app.clear(); native.power.clear(); native.cleanup = []; native.ready = []; native.focused = true;
  native.hour = 4;
  vi.useFakeTimers({ toFake: ['Date', 'performance', 'setInterval', 'clearInterval'] });
  vi.setSystemTime(new Date(2026, 9, 4, 12));
  sqlite = new Database(':memory:');
  for (const statement of DESKTOP_FRESH_SCHEMA_STATEMENTS) sqlite.exec(statement);
  native.connection = { driver: createBetterSqlite3Driver(sqlite), sqlite, dbPath: ':memory:' };
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); sqlite.close(); });
function emit(events: Map<string, (() => void)[]>, event: string) { for (const callback of events.get(event) ?? []) callback(); }
function total() { return sqlite.prepare('SELECT COALESCE(SUM(duration_ms), 0) total FROM foreground_daily_time').get(); }

it('saves once per foreground minute and stops periodic writes when focus leaves', async () => {
  const runtime = await import('./foregroundTimeRuntime.js'); runtime.startDesktopForegroundTime();
  await vi.advanceTimersByTimeAsync(59_000); expect(total()).toEqual({ total: 0 });
  await vi.advanceTimersByTimeAsync(1_000); expect(total()).toEqual({ total: 60_000 });
  await vi.advanceTimersByTimeAsync(5_000); native.focused = false; emit(native.app, 'browser-window-blur');
  await vi.advanceTimersByTimeAsync(0); expect(total()).toEqual({ total: 65_000 });
  const sequence = sqlite.prepare('SELECT state_seq FROM sync_object_state').get();
  await vi.advanceTimersByTimeAsync(600_000); expect(total()).toEqual({ total: 65_000 });
  expect(sqlite.prepare('SELECT state_seq FROM sync_object_state').get()).toEqual(sequence);
});

it('counts a switch between app windows once and keeps lock and suspension independently inactive', async () => {
  const runtime = await import('./foregroundTimeRuntime.js'); runtime.startDesktopForegroundTime();
  await vi.advanceTimersByTimeAsync(10_000);
  emit(native.app, 'browser-window-blur'); emit(native.app, 'browser-window-focus');
  await vi.advanceTimersByTimeAsync(10_000); emit(native.power, 'lock-screen'); emit(native.power, 'suspend');
  await vi.advanceTimersByTimeAsync(60_000); emit(native.power, 'resume');
  await vi.advanceTimersByTimeAsync(60_000); expect(total()).toEqual({ total: 20_000 });
  emit(native.power, 'unlock-screen'); await vi.advanceTimersByTimeAsync(10_000);
  await runtime.stopDesktopForegroundTime(); expect(total()).toEqual({ total: 30_000 });
});

it('settles the library before close and gives a reopened recording an independent cumulative identity', async () => {
  const runtime = await import('./foregroundTimeRuntime.js'); runtime.startDesktopForegroundTime();
  await vi.advanceTimersByTimeAsync(5_000); native.cleanup[0]!();
  const originalId = runtime.desktopForegroundTimeSnapshot().sourceId;
  expect(total()).toEqual({ total: 5_000 });
  await vi.advanceTimersByTimeAsync(600_000); native.ready[0]!();
  expect(runtime.desktopForegroundTimeSnapshot().sourceId).not.toBe(originalId);
  await vi.advanceTimersByTimeAsync(10_000); await runtime.stopDesktopForegroundTime();
  expect(total()).toEqual({ total: 15_000 });
});

it('keeps the cumulative tail and refuses library closure after a storage failure until it can be retried', async () => {
  const runtime = await import('./foregroundTimeRuntime.js'); runtime.startDesktopForegroundTime();
  await vi.advanceTimersByTimeAsync(5_000);
  sqlite.exec(`CREATE TRIGGER fail_foreground_save BEFORE INSERT ON foreground_daily_time
    BEGIN SELECT RAISE(ABORT, 'disk failure'); END`);
  expect(() => native.cleanup[0]!()).toThrow('disk failure');
  expect(sqlite.open).toBe(true);
  expect(() => runtime.desktopForegroundTimeSnapshot()).toThrow('could not be saved');
  sqlite.exec('DROP TRIGGER fail_foreground_save');
  native.cleanup[0]!();
  expect(total()).toEqual({ total: 5_000 });
});
