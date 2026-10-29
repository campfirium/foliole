import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { hydrateCurrentReviewSchedulerSettings } from '../features/settings/model/reviewSchedulerSettings';
import { refreshCompanionWorkspaceAfterMutation } from '../shared/platform/companion/companionWorkspaceRepository';
import { loadCompanionDailySession } from '../shared/platform/companion/runtime/companionDailyFlow';
import { getCompanionReadIntents } from '../shared/platform/companion/runtime/companionReadIntents';
import { createSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';

import { useDailyFlowSurface } from './companionFlowDay.testSupport';

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true }, registerPlugin: createCompanionNativeSyncStub };
});
let library: Awaited<ReturnType<typeof createSearchLibrary>>;
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-26T08:00:00Z'));
  hydrateCurrentReviewSchedulerSettings({ newDayStartsAtHour: 4 });
  library = await createSearchLibrary(70, 32);
  library.database.prepare('UPDATE nodes SET created_at=?,updated_at=?').run('2026-10-26T00:00:00Z', '2026-10-26T00:00:00Z');
});
afterEach(async () => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); await library.close(); });

it('blocks B after A fails, retries the identical command, and never repeats A or its history', async () => {
  const initial = (await refreshCompanionWorkspaceAfterMutation())!;
  const ui = renderHook(() => useDailyFlowSurface(initial));
  await waitFor(() => expect(ui.result.current.surface.readableArticle?.content).toBeTruthy());
  const engine = await getCompanionReadIntents();
  const run = library.connection.run;
  let release!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  let entered = false;
  vi.spyOn(library.connection, 'run').mockImplementation(async (...args) => {
    if (args[0].includes('INSERT INTO node_reading') && !entered) { entered = true; await waiting; throw new Error('disk_test_failure'); }
    return run(...args);
  });
  try {
    await act(async () => { await ui.result.current.surface.handleReadReviewTopic(); });
    await waitFor(() => expect(ui.result.current.surface.readableArticle?.nodeId).toBe('000001'));
    await act(async () => { await ui.result.current.surface.handleReadReviewTopic(); });
    await waitFor(() => expect(ui.result.current.surface.readableArticle?.nodeId).toBe('000002'));
    release();
    await waitFor(() => expect(engine.error).toContain('disk_test_failure'));
    const failed = await engine.journal.rows();
    expect(failed.map(row => row.intent.nodeId)).toEqual(['000000', '000001']);
    expect(failed[0]?.command?.opId).toBe(failed[0]?.intent.id);
    expect(failed[1]?.command).toBeNull();
    expect(library.database.prepare('SELECT count(*) AS n FROM node_reading').get()).toEqual({ n: 0 });
    await act(async () => { await engine.retry(); });
    const completed = await engine.journal.rows(false);
    expect(completed[0]?.command).toEqual(failed[0]?.command);
    expect(completed.map(row => row.state)).toEqual(['applied', 'applied']);
    expect(library.database.prepare('SELECT count(*) AS n FROM daily_flow_operations').get()).toEqual({ n: 2 });
    expect(library.database.prepare('SELECT count FROM topic_daily_counts').get()).toEqual({ count: 2 });
    expect((await loadCompanionDailySession())?.currentNodeId).toBe('000002');
    expect(ui.result.current.surface.readableArticle?.nodeId).toBe('000002');
  } finally { release(); }
});

it('acknowledges a committed Read by its durable fact after the acknowledgement is lost and the day resets', async () => {
  const initial = (await refreshCompanionWorkspaceAfterMutation())!;
  const ui = renderHook(() => useDailyFlowSurface(initial));
  await waitFor(() => expect(ui.result.current.surface.readableArticle?.content).toBeTruthy());
  const engine = await getCompanionReadIntents();
  const settle = engine.journal.settle.bind(engine.journal);
  let lost = false;
  vi.spyOn(engine.journal, 'settle').mockImplementation(async (...args) => {
    if (args[1] === 'applied' && !lost) { lost = true; throw new Error('lost_ack'); }
    return settle(...args);
  });
  await act(async () => { await ui.result.current.surface.handleReadReviewTopic(); });
  await waitFor(() => expect(engine.error).toBe('lost_ack'));
  expect(library.database.prepare('SELECT count(*) AS n FROM daily_flow_operations').get()).toEqual({ n: 1 });
  const row = (await engine.journal.rows())[0]!;
  const { openCompanionDailyFlow } = await import('../shared/platform/companion/runtime/companionDailyFlow');
  await openCompanionDailyFlow({ now: '2026-10-27T08:00:00.000Z', mode: 'recommended' });
  const today = await loadCompanionDailySession();
  expect(library.database.prepare('SELECT count(*) AS n FROM daily_flow_operations').get()).toEqual({ n: 0 });
  await act(async () => { await engine.retry(); });
  expect((await engine.journal.rows(false)).find(value => value.intent.id === row.intent.id)?.state).toBe('applied');
  expect(await loadCompanionDailySession()).toEqual(today);
  expect(library.database.prepare('SELECT repetition_count FROM node_reading WHERE node_id=?').get(row.intent.nodeId)).toEqual({ repetition_count: 1 });
  expect(library.database.prepare('SELECT count FROM topic_daily_counts').get()).toEqual({ count: 1 });
});

it('queues Undo behind the accepted Reads and undoes B rather than an earlier committed operation', async () => {
  const initial = (await refreshCompanionWorkspaceAfterMutation())!;
  const ui = renderHook(() => useDailyFlowSurface(initial));
  await waitFor(() => expect(ui.result.current.surface.readableArticle?.content).toBeTruthy());
  const engine = await getCompanionReadIntents();
  const run = library.connection.run;
  let release!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  let entered = false;
  vi.spyOn(library.connection, 'run').mockImplementation(async (...args) => {
    if (args[0].includes('INSERT INTO node_reading') && !entered) { entered = true; await waiting; }
    return run(...args);
  });
  try {
    await act(async () => { await ui.result.current.surface.handleReadReviewTopic(); });
    await waitFor(() => expect(ui.result.current.surface.readableArticle?.nodeId).toBe('000001'));
    await act(async () => { await ui.result.current.surface.handleReadReviewTopic(); });
    await waitFor(() => expect(ui.result.current.surface.readableArticle?.nodeId).toBe('000002'));
    let undone = false;
    let undo!: Promise<void>;
    act(() => { undo = ui.result.current.surface.handleFlowHistory('undo').then(() => { undone = true; }); });
    expect(undone).toBe(false);
    expect(engine.pending).toBe(true);
    await act(async () => { release(); await undo; });
    expect(ui.result.current.surface.reviewError).toBeNull();
    expect(library.database.prepare('SELECT repetition_count FROM node_reading WHERE node_id=?').get('000000')).toEqual({ repetition_count: 1 });
    expect(library.database.prepare('SELECT repetition_count FROM node_reading WHERE node_id=?').get('000001')).toBeUndefined();
    expect((await loadCompanionDailySession())?.currentNodeId).toBe('000001');
  } finally { release(); }
});

it('keeps the original topic and performs no learning when durable admission fails', async () => {
  const initial = (await refreshCompanionWorkspaceAfterMutation())!;
  const ui = renderHook(() => useDailyFlowSurface(initial));
  await waitFor(() => expect(ui.result.current.surface.readableArticle?.content).toBeTruthy());
  const engine = await getCompanionReadIntents();
  const a = ui.result.current.surface.readableArticle!.nodeId;
  vi.spyOn(engine.journal, 'accept').mockRejectedValueOnce(new Error('admission_disk_failure'));
  await act(async () => { await ui.result.current.surface.handleReadReviewTopic(); });
  expect(ui.result.current.surface.readableArticle?.nodeId).toBe(a);
  expect(ui.result.current.surface.readingError).toBe('admission_disk_failure');
  expect(await engine.journal.rows(false)).toEqual([]);
  expect(library.database.prepare('SELECT count(*) AS n FROM daily_flow_operations').get()).toEqual({ n: 0 });
  await act(async () => { await ui.result.current.surface.handleReadReviewTopic(); await engine.drain(); });
  expect(ui.result.current.surface.readableArticle?.nodeId).not.toBe(a);
  expect(library.database.prepare('SELECT repetition_count FROM node_reading WHERE node_id=?').get(a)).toEqual({ repetition_count: 1 });
});

it('retries next-topic preparation after admission without accepting or learning the same topic twice', async () => {
  const initial = (await refreshCompanionWorkspaceAfterMutation())!;
  const ui = renderHook(() => useDailyFlowSurface(initial));
  await waitFor(() => expect(ui.result.current.surface.readableArticle?.content).toBeTruthy());
  const engine = await getCompanionReadIntents();
  const { getIosCompanionDatabaseOwner } = await import('../shared/platform/companion/runtime/iosCompanionDatabaseBootstrap');
  const owner = getIosCompanionDatabaseOwner();
  await owner.readInteractiveSnapshot(async () => null);
  const a = ui.result.current.surface.readableArticle!.nodeId;
  vi.spyOn(owner, 'readInteractiveSnapshot').mockRejectedValueOnce(new Error('next_topic_read_failure'));
  await act(async () => { await ui.result.current.surface.handleReadReviewTopic(); });
  expect(ui.result.current.surface.readableArticle?.nodeId).toBe(a);
  expect((await engine.journal.rows(false))).toHaveLength(1);
  await act(async () => { await ui.result.current.surface.handleReadReviewTopic(); });
  await waitFor(() => expect(ui.result.current.surface.readableArticle?.nodeId).not.toBe(a));
  expect((await engine.journal.rows(false))).toHaveLength(1);
  expect(library.database.prepare('SELECT repetition_count FROM node_reading WHERE node_id=?').get(a)).toEqual({ repetition_count: 1 });
  expect(library.database.prepare('SELECT count(*) AS n FROM daily_flow_operations').get()).toEqual({ n: 1 });
});
