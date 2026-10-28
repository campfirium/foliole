// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { createBrowserDemoRuntimeController } from '../demo/demoRuntimeController';
import type { Node } from '../features/nodes/model/nodeTypes';
import { emptyBrowserDailyFlow } from '../shared/platform/runtime/browserDailyFlowState';
import { installBrowserDailyFlowRuntime, getBrowserDailyFlowRuntime } from '../shared/platform/runtime/dailyFlowBrowserRuntime';
import { continueToNextDemoPreviewDay, getDemoRuntimeNowIso, installDemoRuntimeController } from '../shared/platform/runtime/demoRuntime';

import { installBrowserWorkspace } from './installBrowserWorkspace';
import { installWorkspaceBrowserCommit } from './workspaceBrowserCommit';
import { createEmptyReviewSession } from './workspaceReviewReading';
import { createInitialWorkspaceState, useWorkspaceStore as store, WORKSPACE_STORAGE_KEY } from './workspaceStore';

const now = '2026-10-28T08:00:00.000Z';
const topic = (id: string, days: number): Node => ({ id, kind: 'topic', title: id, content: `Body ${id}`,
  parentNodeId: null, reveal: null, review: null, createdAt: now, updatedAt: now, reading: days ? {
    intervalDurationMs: 86400000, intervalGrowthFactor: 1, lastHandledAt: now,
    nextAt: new Date(Date.parse(now) + days * 86400000).toISOString(), priority: 5,
    readingPosition: 0, repetitionCount: 1, state: 'active' } : null });

beforeEach(() => {
  installWorkspaceBrowserCommit({ save() {} });
  installBrowserDailyFlowRuntime(null);
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(now));
  const nodes = [topic('today', 0), topic('tomorrow', 1), topic('later', 3)];
  store.setState({ ...createInitialWorkspaceState(new Date(now)), browserDailyFlow: emptyBrowserDailyFlow(),
    nodeOrder: nodes.map(node => node.id), nodesById: Object.fromEntries(nodes.map(node => [node.id, node])),
    reviewSession: createEmptyReviewSession() });
  installWorkspaceBrowserCommit(null);
  localStorage.clear();
  installBrowserWorkspace(store, localStorage, store.getState());
  installDemoRuntimeController(createBrowserDemoRuntimeController());
});
afterEach(() => { installWorkspaceBrowserCommit(null); installBrowserDailyFlowRuntime(null); vi.useRealTimers(); });

it('groups each future node by its first available day without saving or changing learning', async () => {
  const before = store.getState();
  const raw = localStorage.getItem(WORKSPACE_STORAGE_KEY);
  const result = await getBrowserDailyFlowRuntime()!.future({ now, mode: 'recommended', includeEntries: true }, before.nodesById);
  expect(result.dayBuckets).toEqual([{ dayOffset: 1, nodeIds: ['tomorrow'] }, { dayOffset: 3, nodeIds: ['later'] }]);
  expect(new Set(result.dayBuckets!.flatMap(bucket => bucket.nodeIds)).size).toBe(2);
  const summary = await getBrowserDailyFlowRuntime()!.future({ now, mode: 'recommended', includeEntries: false }, before.nodesById);
  expect(summary.hasFuture).toBe(true);
  expect(summary.dayBuckets).toBeNull();
  const reviewOnly = await getBrowserDailyFlowRuntime()!.future({ now, mode: 'review-first', includeEntries: true }, before.nodesById);
  expect(reviewOnly.hasFuture).toBe(false);
  expect(store.getState()).toBe(before);
  expect(localStorage.getItem(WORKSPACE_STORAGE_KEY)).toBe(raw);
});

it('does not learn a future preferred target until the simulated day advances', async () => {
  await store.getState().startReviewSession(now);
  expect(store.getState().reviewSession.currentNodeId).toBe('today');
  await store.getState().dismissReviewTopic(now);
  const futureFact = store.getState().nodesById.tomorrow!.reading;
  expect(await store.getState().resumeReviewSession(now, { preferredNodeId: 'tomorrow' })).toBe(false);
  expect(store.getState().reviewSession.currentNodeId).toBeNull();
  expect(store.getState().nodesById.tomorrow!.reading).toEqual(futureFact);
  continueToNextDemoPreviewDay();
  const next = getDemoRuntimeNowIso();
  expect(next).toBe('2026-10-29T08:00:00.000Z');
  expect(await store.getState().resumeReviewSession(next, { preferredNodeId: 'tomorrow' })).toBe('tomorrow');
  expect(store.getState().reviewSession.readTopicCount).toBe(0);
  expect(store.getState().nodesById.tomorrow!.reading).toEqual(futureFact);
  const result = await getBrowserDailyFlowRuntime()!.future({ now: next, mode: 'recommended', includeEntries: true }, store.getState().nodesById);
  expect(result.dayBuckets).toEqual([{ dayOffset: 2, nodeIds: ['later'] }]);
});

it('uses saved lifecycle and mode eligibility for future groups', async () => {
  store.setState(state => ({ nodesById: { ...state.nodesById,
    tomorrow: { ...state.nodesById.tomorrow!, reading: { ...state.nodesById.tomorrow!.reading!, state: 'locked' } },
    later: { ...state.nodesById.later!, shelvedAt: now } } }));
  const result = await getBrowserDailyFlowRuntime()!.future({ now, mode: 'recommended', includeEntries: true }, store.getState().nodesById);
  expect(result.dayBuckets).toEqual([]);
  expect(result.hasFuture).toBe(false);
});

it('does not seed a brand-new daily list with a scheduled fallback target', async () => {
  store.setState(state => ({ nodesById: { ...state.nodesById,
    today: { ...state.nodesById.today!, reading: { ...state.nodesById.tomorrow!.reading!, state: 'done' } } } }));
  expect(store.getState().browserDailyFlow?.state).toBeNull();
  expect(await store.getState().resumeReviewSession(now, { preferredNodeId: 'tomorrow' })).toBe(false);
  expect(store.getState().reviewSession.currentNodeId).toBeNull();
  expect(store.getState().reviewSession.sessionStartedAt).toBeNull();
  expect(store.getState().nodesById.tomorrow!.reading?.repetitionCount).toBe(1);
});

it('returns every exclusive future entry without placing it into today', async () => {
  const nodes = [topic('today', 0), ...Array.from({ length: 25 }, (_, index) => topic(`future-${index}`, index + 1))];
  store.setState({ nodeOrder: nodes.map(node => node.id), nodesById: Object.fromEntries(nodes.map(node => [node.id, node])) });
  const runtime = getBrowserDailyFlowRuntime()!;
  const future = await runtime.future({ now, mode: 'recommended', includeEntries: true }, store.getState().nodesById);
  expect(future.dayBuckets!.flatMap(bucket => bucket.nodeIds)).toHaveLength(25);
  expect(future.dayBuckets![24]).toEqual({ dayOffset: 25, nodeIds: ['future-24'] });
  await store.getState().startReviewSession(now);
  expect(store.getState().reviewSession.currentNodeId).toBe('today');
  expect(store.getState().reviewSession.totalNodeCount).toBe(1);
});
