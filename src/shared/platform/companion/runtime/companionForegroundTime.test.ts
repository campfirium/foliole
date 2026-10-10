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
  return { foregroundTimeOwnerId: async () => '11111111-1111-4111-8111-111111111111',
    runWriter: <T>(task: (db: typeof port) => Promise<T>) => task(port) };
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
  expect(companionForegroundTimeSnapshot()!.sourceId).toBe(originalSource);
  await vi.advanceTimersByTimeAsync(10_000); await flushCompanionForegroundTime();
  expect(total()).toEqual({ total: 70_000 });
  expect(db.prepare('SELECT COUNT(*) count FROM foreground_daily_time').get()).toEqual({ count: 1 });
});

it('counts only foreground maintenance time once and settles into the restored source', async () => {
  const { withCompanionForegroundTimeMaintenance } = await import('./companionForegroundTime');
  await startCompanionForegroundTime(owner());
  await vi.advanceTimersByTimeAsync(5_000);
  const originalSource = companionForegroundTimeSnapshot()!.sourceId;
  await withCompanionForegroundTimeMaintenance(async () => {
    expect(total()).toEqual({ total: 5_000 });
    await vi.advanceTimersByTimeAsync(2_000); lifecycle.background();
    await vi.advanceTimersByTimeAsync(100_000); lifecycle.foreground();
    await vi.advanceTimersByTimeAsync(3_000);
    expect(total()).toEqual({ total: 5_000 });
    db.prepare("UPDATE workspace_meta SET value = ? WHERE key GLOB 'foreground_time_source:*'")
      .run('22222222-2222-4222-8222-222222222222');
  });
  expect(companionForegroundTimeSnapshot()!.sourceId).not.toBe(originalSource);
  expect(total()).toEqual({ total: 10_000 });
  await flushCompanionForegroundTime(); expect(total()).toEqual({ total: 10_000 });
});

it('retains pending foreground across interrupted overwrite rounds until completion', async () => {
  const { withCompanionForegroundTimeMaintenance } = await import('./companionForegroundTime');
  await startCompanionForegroundTime(owner());
  await vi.advanceTimersByTimeAsync(5_000);
  await expect(withCompanionForegroundTimeMaintenance(async () => {
    await vi.advanceTimersByTimeAsync(2_000); throw new Error('interrupted');
  }, async () => false)).rejects.toThrow('interrupted');
  await vi.advanceTimersByTimeAsync(120_000);
  await flushCompanionForegroundTime(); expect(total()).toEqual({ total: 5_000 });
  await withCompanionForegroundTimeMaintenance(async () => { await vi.advanceTimersByTimeAsync(3_000); });
  expect(total()).toEqual({ total: 130_000 });
});

it('keeps the settled source and maintenance tail when restoration fails before replacement', async () => {
  const { withCompanionForegroundTimeMaintenance } = await import('./companionForegroundTime');
  await startCompanionForegroundTime(owner());
  await vi.advanceTimersByTimeAsync(5_000);
  const source = companionForegroundTimeSnapshot()!.sourceId;
  await expect(withCompanionForegroundTimeMaintenance(async () => {
    await vi.advanceTimersByTimeAsync(2_000); throw new Error('restore failed');
  })).rejects.toThrow('restore failed');
  expect(companionForegroundTimeSnapshot()!.sourceId).toBe(source);
  expect(total()).toEqual({ total: 7_000 });
});

it('shows the maintenance contribution when synchronization raises the previously settled source', async () => {
  const { withCompanionForegroundTimeMaintenance } = await import('./companionForegroundTime');
  const { readForegroundTimeHistory } = await import('../../../../../lib/core/database/foregroundTimeHistory');
  await startCompanionForegroundTime(owner());
  await vi.advanceTimersByTimeAsync(5_000);
  await withCompanionForegroundTimeMaintenance(async () => {
    await vi.advanceTimersByTimeAsync(2_000);
    db.prepare('UPDATE foreground_daily_time SET duration_ms = 10000').run();
    const history = await readForegroundTimeHistory(createBetterSqliteDbPort(db), {
      fromDay: '2026-10-04', toDay: '2026-10-05'
    }, 4, companionForegroundTimeSnapshot());
    expect(history.days).toEqual([{ day: '2026-10-04', durationMs: 12_000 }]);
  });
  expect(total()).toEqual({ total: 12_000 });
});

it('blocks replacement after a failed tail settlement and retains the unsaved duration for retry', async () => {
  const { withCompanionForegroundTimeMaintenance } = await import('./companionForegroundTime');
  await startCompanionForegroundTime(owner());
  const replace = vi.fn(async () => { await vi.advanceTimersByTimeAsync(3_000); });
  await vi.advanceTimersByTimeAsync(5_000);
  db.exec("CREATE TRIGGER fail_tail BEFORE INSERT ON foreground_daily_time BEGIN SELECT RAISE(ABORT,'tail_failure'); END");
  await expect(withCompanionForegroundTimeMaintenance(replace)).rejects.toThrow('tail_failure');
  expect(replace).not.toHaveBeenCalled();
  db.exec('DROP TRIGGER fail_tail');
  await vi.advanceTimersByTimeAsync(2_000);
  await withCompanionForegroundTimeMaintenance(replace);
  expect(replace).toHaveBeenCalledTimes(1);
  expect(total()).toEqual({ total: 10_000 });
});

it('keeps a reopened incomplete overwrite in maintenance until its durable progress is finished', async () => {
  const progress = { groupId: 'group', overwriteId: 'restore', providerDeviceId: 'other', providerLibraryEpoch: 'other-epoch',
    receiverDeviceId: 'mobile', receiverLibraryEpoch: 'restore' };
  db.prepare('INSERT INTO sync_group_metadata VALUES (?, ?, ?)').run('sync_group_overwrite_progress', JSON.stringify(progress), 'now');
  await startCompanionForegroundTime(owner());
  const source = companionForegroundTimeSnapshot()!.sourceId;
  await vi.advanceTimersByTimeAsync(120_000); await flushCompanionForegroundTime();
  expect(total()).toEqual({ total: 0 });
  const { withCompanionForegroundTimeMaintenance } = await import('./companionForegroundTime');
  await withCompanionForegroundTimeMaintenance(async () => {
    db.prepare('DELETE FROM sync_group_metadata WHERE key = ?').run('sync_group_overwrite_progress');
  });
  expect(companionForegroundTimeSnapshot()!.sourceId).toBe(source);
  expect(total()).toEqual({ total: 120_000 });
});
