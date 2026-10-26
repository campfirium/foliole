// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';

import { DEFAULT_REVIEW_SCHEDULER_SETTINGS, hydrateCurrentReviewSchedulerSettings } from '../features/settings/model/reviewSchedulerSettings';
import { replayCompanionFlowHistory } from '../shared/platform/companion/runtime/companionFlowHistory';
import { mutateCompanionWorkspace } from '../shared/platform/companion/runtime/companionWorkspaceMutations';

import { createHistoryDeltaFixture, historyKey, historyNow } from './companionHistoryDelta.testSupport';

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true }, registerPlugin: createCompanionNativeSyncStub };
});
let app: Awaited<ReturnType<typeof createHistoryDeltaFixture>>;
afterEach(async () => { await app?.library.close(); hydrateCurrentReviewSchedulerSettings(DEFAULT_REVIEW_SCHEDULER_SETTINGS); });
const facts = () => ({ review: app.db.prepare('SELECT * FROM review_log ORDER BY op_id').all(),
  reading: app.db.prepare('SELECT * FROM node_reading ORDER BY node_id').all() });
const daily = () => app.db.prepare('SELECT * FROM daily_flow_state').get();

for (const mode of ['undo', 'redo'] as const) {
it.each(['grade', 'soon', 'read', 'later', 'dismiss'] as const)(`retries a lost %s ${mode} receipt exactly once after reopen`, async action => {
  app = await createHistoryDeltaFixture(action !== 'grade');
  await app.open();
  const beforeAction = structuredClone(app.session);
  await app.action(action);
  const afterAction = structuredClone(app.session);
  if (mode === 'redo') await app.replay('undo');
  const source = structuredClone(app.session);
  const commit = app.connection.commitTransaction.bind(app.connection);
  vi.spyOn(app.connection, 'commitTransaction').mockImplementationOnce(async () => {
    await commit(); throw new Error('commit_receipt_lost');
  });
  await expect(replayCompanionFlowHistory(historyKey, mode, source, 'lost-replay')).rejects.toThrow();
  const savedFacts = facts();
  const savedDaily = daily();
  const savedHistory = await app.history();
  expect(savedHistory.undoStack).toHaveLength(mode === 'undo' ? 0 : 1);
  expect(savedHistory.redoStack).toHaveLength(mode === 'undo' ? 1 : 0);
  await app.reopen();
  const restored = await replayCompanionFlowHistory(historyKey, mode, source, 'lost-replay');
  expect(restored?.currentNodeId).toBe((mode === 'undo' ? beforeAction : afterAction).currentNodeId);
  expect(facts()).toEqual(savedFacts);
  expect(daily()).toEqual(savedDaily);
  expect(await app.history()).toEqual(savedHistory);
  app.session = restored!;
  const projection = (await app.snapshot()).nodesById.a;
  await app.replay(mode === 'undo' ? 'redo' : 'undo');
  await app.replay(mode);
  expect(app.session.queueNodeIds).toEqual(restored!.queueNodeIds);
  expect((await app.snapshot()).nodesById.a?.reading).toEqual(projection?.reading);
  expect((await app.snapshot()).nodesById.a?.review?.reps).toBe(projection?.review?.reps);
});
}

it.each(['grade', 'soon', 'read', 'later', 'dismiss'] as const)('rolls back %s undo facts and cursor if history persistence fails', async action => {
  app = await createHistoryDeltaFixture(action !== 'grade');
  await app.open();
  await app.action(action);
  const initialFacts = facts();
  const initialDaily = daily();
  const history = await app.history();
  app.db.exec("CREATE TRIGGER reject_replay BEFORE INSERT ON companion_meta WHEN NEW.key LIKE 'flow_history:%' BEGIN SELECT RAISE(ABORT, 'disk full'); END");
  await expect(app.replay('undo')).rejects.toThrow();
  expect(facts()).toEqual(initialFacts);
  expect(daily()).toEqual(initialDaily);
  expect(await app.history()).toEqual(history);
  app.db.exec('DROP TRIGGER reject_replay');
  await app.replay('undo');
  expect((await app.history()).redoStack).toHaveLength(1);
});

it('rejects a changed current-day context without installing the previous learning-day list', async () => {
  app = await createHistoryDeltaFixture();
  await app.open();
  await app.action('soon');
  await app.action('read');
  await app.reopen();
  await app.open('2026-10-27T08:00:00.000Z');
  const today = daily();
  const history = await app.history();
  const initialFacts = facts();
  await expect(app.replay('undo')).rejects.toThrow();
  expect(daily()).toEqual(today);
  expect(facts()).toEqual(initialFacts);
  expect(await app.history()).toEqual(history);
});

it('keeps 50 delta steps and clears redo only when a replacement action commits', async () => {
  app = await createHistoryDeltaFixture();
  let stamp = historyNow;
  await app.open(stamp);
  for (let i = 0; i < 52; i++) {
    if (!app.session.currentNodeId) {
      const next = app.db.prepare('SELECT MIN(next_at) FROM node_reading').pluck().get() as string;
      stamp = new Date(Math.max(Date.parse(stamp) + 86400000, Date.parse(next) + 1000)).toISOString();
      await app.open(stamp);
    }
    await app.action('read', stamp);
  }
  expect((await app.history()).undoStack).toHaveLength(50);
  expect(JSON.stringify(await app.history())).not.toContain('"queueNodeIds":["');
  await app.replay('undo');
  expect((await app.history()).redoStack).toHaveLength(1);
  await app.action('dismiss', stamp);
  expect((await app.history()).redoStack).toHaveLength(0);
  expect((await app.history()).undoStack).toHaveLength(50);
});

it.each(['read', 'later', 'dismiss'] as const)('replays a Soon, grade and %s chain after reopening without losing unrelated edits', async action => {
  app = await createHistoryDeltaFixture(true, ['d', 'e']);
  app.db.exec("UPDATE nodes SET kind='item', reveal='Answer' WHERE id IN ('b','d','e')");
  hydrateCurrentReviewSchedulerSettings({ ...DEFAULT_REVIEW_SCHEDULER_SETTINGS, pushQueue: {
    ...DEFAULT_REVIEW_SCHEDULER_SETTINGS.pushQueue, queueMixRatio: { fsrs: 1, reading: 1 } } });
  await app.open(historyNow, 'a');
  const original = structuredClone(app.session);
  expect(original.currentNodeId).toBe('a');
  await app.action('soon');
  let steps = 1;
  while ((await app.snapshot()).nodesById[app.session.currentNodeId!]?.kind === 'item') {
    await app.action('grade'); steps += 1;
  }
  expect(app.session.currentNodeId).toBe('c');
  await app.action(action); steps += 1;
  while ((await app.snapshot()).nodesById[app.session.currentNodeId!]?.kind === 'item') {
    await app.action('grade'); steps += 1;
  }
  expect(app.session.currentNodeId).toBe('a');
  const final = structuredClone(app.session);
  await app.reopen();
  await app.open();
  for (let i = 0; i < steps; i++) {
    try { await app.replay('undo'); }
    catch (error) { throw new Error(`undo ${i}: ${JSON.stringify({ session: app.session, entry: (await app.history()).undoStack.at(-1) })}`, { cause: error }); }
  }
  expect(app.session.queueNodeIds).toEqual(original.queueNodeIds);
  expect((await app.snapshot()).nodesById.b?.review?.reps).toBe(2);
  expect((await app.snapshot()).nodesById.c?.reading).toBeNull();
  app.db.prepare("UPDATE nodes SET title='Unrelated edited title' WHERE id='a'").run();
  for (let i = 0; i < steps; i++) {
    try { await app.replay('redo'); }
    catch (error) { throw new Error(`redo ${i}: ${JSON.stringify({ session: app.session, entry: (await app.history()).redoStack.at(-1) })}`, { cause: error }); }
  }
  expect(app.session.currentNodeId).toBe(final.currentNodeId);
  expect(app.session.queueNodeIds).toEqual(final.queueNodeIds);
  expect((await app.snapshot()).nodesById.b?.review?.reps).toBe(3);
  expect((await app.snapshot()).nodesById.a?.title).toBe('Unrelated edited title');
});

it('keeps local deletion and reading deltas in the same durable timeline', async () => {
  app = await createHistoryDeltaFixture();
  await app.open();
  const original = structuredClone(app.session);
  await app.action('read');
  const deletedId = app.session.currentNodeId!;
  await mutateCompanionWorkspace({ type: 'delete', nodeId: deletedId }, { session: app.session, mode: app.mode });
  await app.open();
  expect(app.session.currentNodeId).not.toBe(deletedId);
  await app.reopen();
  await app.replay('undo');
  expect(app.session.currentNodeId).toBe(deletedId);
  expect((await app.snapshot()).trashedNodeIds).not.toContain(deletedId);
  await app.replay('undo');
  expect(app.session.queueNodeIds).toEqual(original.queueNodeIds);
  expect((await app.snapshot()).nodesById[original.currentNodeId!]!.reading).toBeNull();
  await app.replay('redo');
  await app.replay('redo');
  expect((await app.snapshot()).trashedNodeIds).toContain(deletedId);
});
