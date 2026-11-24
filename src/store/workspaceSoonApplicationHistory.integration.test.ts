// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';

import { installBrowserDailyFlowRuntime } from '../shared/platform/runtime/dailyFlowBrowserRuntime';

import { createApplicationHistory } from './workspaceApplicationHistory';
import { installWorkspaceBrowserCommit } from './workspaceBrowserCommit';
import { browserFlow, flowNode, flowNow as now } from './workspaceBrowserFlow.testSupport';
import { createBrowserLocalWorkspaceMutationRepository, installWorkspaceMutationRepository,
  resetWorkspaceMutationRepository } from './workspaceMutationRepository';

afterEach(() => {
  installWorkspaceBrowserCommit(null);
  installBrowserDailyFlowRuntime(null);
  resetWorkspaceMutationRepository();
});

it('keeps a desktop action redoable after Soon finds no other topic', async () => {
  installWorkspaceMutationRepository(createBrowserLocalWorkspaceMutationRepository());
  const future = new Date(Date.parse(now) + 60_000).toISOString();
  const store = browserFlow([
    flowNode('a'),
    flowNode('b', false, { createdAt: future, updatedAt: future }),
    flowNode('folder', false, { kind: 'folder', content: '' })
  ]);
  store.setState(state => ({
    appActionHistory: { ...state.appActionHistory, application: createApplicationHistory() }
  }));
  await store.getState().startReviewSession(now);
  expect(await store.getState().revisitReviewTopicSoon(now)).toBe(true);
  expect(await store.getState().updateNodeTitle('folder', 'Renamed')).toBe(true);
  expect(store.getState().undoApplicationOperation()).toBe(true);
  await vi.waitFor(() => expect(store.getState().appActionHistory.application?.requests).toEqual([]));
  expect(store.getState().nodesById.folder?.title).toBe('folder');
  expect(store.getState().reviewSession.currentNodeId).toBe('a');
  expect(store.getState().appActionHistory.redoStack).toHaveLength(1);
  const before = store.getState();
  const storedBefore = localStorage.getItem('foliole-workspace-v1');

  expect(await store.getState().revisitReviewTopicSoon(now)).toBe('daily_flow_no_other_topics');

  expect(store.getState().reviewSession).toEqual(before.reviewSession);
  expect(store.getState().browserDailyFlow).toEqual(before.browserDailyFlow);
  expect(store.getState().appActionHistory.undoStack).toEqual(before.appActionHistory.undoStack);
  expect(store.getState().appActionHistory.redoStack).toEqual(before.appActionHistory.redoStack);
  expect(localStorage.getItem('foliole-workspace-v1')).toBe(storedBefore);
  expect(store.getState().redoApplicationOperation()).toBe(true);
  await vi.waitFor(() => expect(store.getState().appActionHistory.application?.requests).toEqual([]));
  expect(store.getState().nodesById.folder?.title).toBe('Renamed');
  const saved = JSON.parse(localStorage.getItem('foliole-workspace-v1')!);
  expect(saved.state.nodesById.folder.title).toBe('Renamed');

  expect(await store.getState().revisitReviewTopicSoon(future)).toBe(true);
  expect(store.getState().reviewSession.currentNodeId).toBe('b');
  expect(JSON.parse(localStorage.getItem('foliole-workspace-v1')!).state.reviewSession.currentNodeId).toBe('b');
});
