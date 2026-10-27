// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { emptyBrowserDailyFlow } from '../shared/platform/runtime/browserDailyFlowState';
import { installBrowserDailyFlowRuntime } from '../shared/platform/runtime/dailyFlowBrowserRuntime';
import { loadDailyFlowViewRuntime, commitDailyFlowRuntime } from '../shared/platform/runtime/dailyFlowRuntimeRepository';

import { installBrowserWorkspace } from './installBrowserWorkspace';
import { installWorkspaceBrowserCommit } from './workspaceBrowserCommit';
import { createEmptyReviewSession } from './workspaceReviewReading';
import { useWorkspaceStore as store, createInitialWorkspaceState, WORKSPACE_STORAGE_KEY } from './workspaceStore';

const now = '2026-10-28T08:00:00.000Z';
const saved = () => JSON.parse(localStorage.getItem(WORKSPACE_STORAGE_KEY)!);
beforeEach(() => {
  installWorkspaceBrowserCommit(null);
  installBrowserDailyFlowRuntime(null);
  localStorage.clear();
  const initial = createInitialWorkspaceState(new Date(now));
  store.setState({ ...initial, browserDailyFlow: emptyBrowserDailyFlow(), libraryScope: 'browser-workspace',
    nodeOrder: ['a', 'b'], nodesById: Object.fromEntries(['a', 'b'].map(id => [id, { id, kind: 'topic',
      parentNodeId: null, title: id, content: `Body ${id}`, reveal: null, review: null,
      createdAt: now, updatedAt: now }])), reviewSession: createEmptyReviewSession() });
  installBrowserWorkspace(store, localStorage, store.getState());
});
afterEach(() => { installWorkspaceBrowserCommit(null); installBrowserDailyFlowRuntime(null); vi.restoreAllMocks(); });

it('prepares without timing, persists Read and history together, and restores both on reload', async () => {
  const before = store.getState();
  const summary = await loadDailyFlowViewRuntime({ now, mode: 'recommended', includeEntries: true }, before.reviewSession, before.nodesById);
  expect(summary.view.nodeIds).toHaveLength(2);
  expect(saved().state.browserDailyFlow.state.session.sessionStartedAt).toBeNull();
  expect(store.getState().reviewSession.currentNodeId).toBeNull();
  expect(await store.getState().startReviewSession(now)).toBe(true);
  const target = store.getState().reviewSession.currentNodeId!;
  expect(await store.getState().readReviewTopic(now)).toBe(true);
  expect(saved().state.nodesById[target].reading.repetitionCount).toBe(1);
  expect(saved().state.appActionHistory.undoStack).toHaveLength(1);
  const committed = store.getState().reviewSession;
  installBrowserWorkspace(store, localStorage);
  expect(store.getState().reviewSession).toEqual(committed);
  expect(store.getState().appActionHistory.undoStack).toHaveLength(1);
  expect(await store.getState().undoWorkspaceAction()).toBe(true);
  expect(store.getState().reviewSession.currentNodeId).toBe(target);
  expect(store.getState().nodesById[target]?.reading ?? null).toBeNull();
  expect(await store.getState().redoWorkspaceAction()).toBe(true);
  expect(store.getState().nodesById[target]?.reading?.repetitionCount).toBe(1);
});

it('keeps the visible and durable state when its single save fails, then retries once', async () => {
  await store.getState().startReviewSession(now);
  const before = store.getState();
  const raw = localStorage.getItem(WORKSPACE_STORAGE_KEY);
  const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => { throw new Error('disk full'); });
  expect(await store.getState().readReviewTopic(now)).toBe(false);
  expect(store.getState()).toBe(before);
  expect(localStorage.getItem(WORKSPACE_STORAGE_KEY)).toBe(raw);
  spy.mockRestore();
  expect(await store.getState().readReviewTopic(now)).toBe(true);
  expect(store.getState().nodesById[before.reviewSession.currentNodeId!]?.reading?.repetitionCount).toBe(1);
  expect(saved().state.appActionHistory.undoStack).toHaveLength(1);
});

it('replays a saved operation after a lost result without advancing or counting twice', async () => {
  await store.getState().startReviewSession(now);
  const source = store.getState();
  const target = source.reviewSession.currentNodeId!;
  const args = { opId: 'lost-soon', now, token: source.reviewSession.daily!, sourceSession: source.reviewSession,
    readingAction: 'soon' as const, readings: [{ nodeId: target, before: null, after: null }] };
  const first = await commitDailyFlowRuntime(args, source.nodesById);
  const raw = localStorage.getItem(WORKSPACE_STORAGE_KEY);
  const retry = await commitDailyFlowRuntime(args, store.getState().nodesById);
  expect(retry.replayed).toBe(true);
  expect(retry.session).toEqual(first.session);
  expect(localStorage.getItem(WORKSPACE_STORAGE_KEY)).toBe(raw);
  expect(retry.session.readTopicCount).toBe(1);
});

it('saves the complete learning action once before subscribers can observe it', async () => {
  await store.getState().startReviewSession(now);
  const before = store.getState();
  const target = before.reviewSession.currentNodeId!;
  const original = Storage.prototype.setItem;
  const writes: string[] = [];
  const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
    if (key === WORKSPACE_STORAGE_KEY) {
      expect(store.getState()).toBe(before);
      const candidate = JSON.parse(value).state;
      expect(candidate.nodesById[target].reading.repetitionCount).toBe(1);
      expect(candidate.appActionHistory.undoStack).toHaveLength(1);
      expect(candidate.appActionHistory.pendingAction).toBeNull();
      writes.push(value);
    }
    original.call(this, key, value);
  });
  expect(await store.getState().readReviewTopic(now)).toBe(true);
  spy.mockRestore();
  expect(writes).toHaveLength(1);
  expect(saved().state.reviewSession).toEqual(store.getState().reviewSession);
});

it('explicitly upgrades known legacy facts, Soon, timers and history before retiring the old envelope', async () => {
  await store.getState().startReviewSession(now);
  const soon = store.getState().reviewSession.currentNodeId!;
  await store.getState().revisitReviewTopicSoon(now);
  const current = store.getState().reviewSession.currentNodeId!;
  const old = saved();
  old.version = 0;
  delete old.state.browserDailyFlow;
  const legacySession = { currentNodeId: current, isAnswerRevealed: true, queueNodeIds: [current], soonNodeIds: [soon],
    totalNodeCount: 2, sessionStartedAt: now, currentItemStartedAt: now, readTopicCount: 7, readingElapsedMs: 125 };
  old.state.reviewSession = legacySession;
  localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(old));
  installBrowserWorkspace(store, localStorage);
  expect(saved().version).toBe(2);
  expect(store.getState().reviewSession).toEqual(legacySession);
  expect(store.getState().nodesById.a?.reading ?? null).toEqual(old.state.nodesById.a.reading ?? null);
  expect(store.getState().appActionHistory.undoStack).toEqual(old.state.appActionHistory.undoStack);
  await store.getState().startReviewSession(now);
  expect(store.getState().reviewSession).toMatchObject({ readTopicCount: 7, readingElapsedMs: 125, currentNodeId: current });
  expect(store.getState().browserDailyFlow?.rows.find(row => row.node_id === soon)?.cohort).toBe('soon');
});

it('preserves unknown or unsavable old envelopes without publishing a reset', () => {
  const before = store.getState();
  const unknown = JSON.stringify({ version: 999, state: saved().state });
  localStorage.setItem(WORKSPACE_STORAGE_KEY, unknown);
  expect(() => installBrowserWorkspace(store, localStorage)).toThrow('browser_workspace_format_unknown');
  expect(localStorage.getItem(WORKSPACE_STORAGE_KEY)).toBe(unknown);
  expect(store.getState()).toBe(before);
  const old = JSON.stringify({ version: 0, state: saved().state });
  localStorage.setItem(WORKSPACE_STORAGE_KEY, old);
  vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => { throw new Error('disk full'); });
  expect(() => installBrowserWorkspace(store, localStorage)).toThrow('disk full');
  expect(localStorage.getItem(WORKSPACE_STORAGE_KEY)).toBe(old);
  expect(store.getState()).toBe(before);
});

it('guards ordinary edits to the same key before publishing and retains concurrent document edits', async () => {
  const before = store.getState();
  const raw = localStorage.getItem(WORKSPACE_STORAGE_KEY);
  const fail = vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => { throw new Error('disk full'); });
  expect(() => store.setState({ layout: { ...before.layout, listWidth: 333 } })).toThrow('disk full');
  expect(store.getState()).toBe(before);
  expect(localStorage.getItem(WORKSPACE_STORAGE_KEY)).toBe(raw);
  fail.mockRestore();
  await store.getState().startReviewSession(now);
  const target = store.getState().reviewSession.currentNodeId!;
  const reading = store.getState().readReviewTopic(now);
  store.setState(state => ({ nodesById: { ...state.nodesById,
    [target]: { ...state.nodesById[target]!, content: 'Edited during the action' } } }));
  expect(await reading).toBe(true);
  expect(store.getState().nodesById[target]?.content).toBe('Edited during the action');
  expect(saved().state.nodesById[target].content).toBe('Edited during the action');
  expect(saved().state.nodesById[target].reading.repetitionCount).toBe(1);
});

it('keeps grading, original facts and replay history durable across reload', async () => {
  store.setState(state => ({ nodesById: { ...state.nodesById, a: { ...state.nodesById.a!, kind: 'item', reveal: 'Answer',
    review: { due: now, lastReviewAt: null, state: 0, stability: 0, difficulty: 0,
      elapsedDays: 0, scheduledDays: 0, reps: 0, lapses: 0 } } } }));
  await store.getState().setReviewSessionMode('review-first', now);
  expect(await store.getState().startReviewSession(now)).toBe(true);
  expect(store.getState().reviewSession.currentNodeId).toBe('a');
  store.getState().revealReviewAnswer();
  expect(await store.getState().gradeReviewCard(3, now)).toBe(true);
  expect(saved().state.nodesById.a.review.reps).toBe(1);
  expect(Object.values(saved().state.browserDailyFlow.reviewEvents)).toHaveLength(1);
  expect(saved().state.appActionHistory.undoStack).toHaveLength(1);
  installBrowserWorkspace(store, localStorage);
  expect(await store.getState().undoWorkspaceAction()).toBe(true);
  expect(store.getState().nodesById.a?.review?.reps).toBe(0);
  expect(await store.getState().redoWorkspaceAction()).toBe(true);
  expect(saved().state.nodesById.a.review.reps).toBe(1);
  expect(Object.values(saved().state.browserDailyFlow.reviewEvents)).toHaveLength(3);
});

it('retains a known legacy review profile when recording its first new grade', async () => {
  const legacy = saved();
  legacy.version = 0;
  delete legacy.state.browserDailyFlow;
  legacy.state.nodesById.a = { ...legacy.state.nodesById.a, kind: 'item', reveal: 'Answer',
    review: { due: now, lastReviewAt: '2026-10-20T08:00:00.000Z', state: 2, stability: 4, difficulty: 4,
      elapsedDays: 8, scheduledDays: 8, reps: 5, lapses: 1 } };
  localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(legacy));
  installBrowserWorkspace(store, localStorage);
  await store.getState().setReviewSessionMode('review-first', now);
  await store.getState().startReviewSession(now);
  store.getState().revealReviewAnswer();
  expect(await store.getState().gradeReviewCard(3, now)).toBe(true);
  expect(saved().state.nodesById.a.review.reps).toBe(6);
  expect(await store.getState().undoWorkspaceAction()).toBe(true);
  expect(saved().state.nodesById.a.review.reps).toBe(5);
  expect(await store.getState().redoWorkspaceAction()).toBe(true);
  expect(saved().state.nodesById.a.review.reps).toBe(6);
});
