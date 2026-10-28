import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { installBrowserDailyFlowRuntime } from '../shared/platform/runtime/dailyFlowBrowserRuntime';

import { installWorkspaceBrowserCommit } from './workspaceBrowserCommit';
import { browserFlow, flowNode, flowNow as now } from './workspaceBrowserFlow.testSupport';
import { createBrowserLocalWorkspaceMutationRepository } from './workspaceMutationRepository';
import { createWorkspaceTrashActions } from './workspaceStoreTrashActions';

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(now)); });
afterEach(() => { installWorkspaceBrowserCommit(null); installBrowserDailyFlowRuntime(null); vi.useRealTimers(); });

it.each(['setActiveNode', 'openNode'] as const)('retains the service current while %s browses another queued topic', async action => {
  const store = browserFlow([flowNode('a'), flowNode('b')]);
  await store.getState().resumeReviewSession(now, { preferredNodeId: 'a' });
  const before = store.getState().reviewSession;
  store.getState()[action]('b');
  expect(store.getState().activeNodeId).toBe('b');
  expect(store.getState().reviewSession).toEqual(before);
});

it('lets the service replace a deleted current even when the renderer trash projection is stale', async () => {
  const store = browserFlow([flowNode('a'), flowNode('b')]);
  await store.getState().resumeReviewSession(now, { preferredNodeId: 'a' });
  store.setState(state => ({ nodesById: { ...state.nodesById, a: { ...state.nodesById.a!, deletedAt: now } } }));
  await vi.waitFor(() => expect(store.getState().reviewSession.currentNodeId).toBe('b'));
  expect(store.getState().activeNodeId).toBe('b');
  expect(store.getState().trashedNodeIds).toEqual([]);
  expect(store.getState().browserDailyFlow!.state!.session.currentNodeId).toBe('b');
});

it.each([false, true])('deletes the current through the browser receipt and opens its successor with nested=%s', async nested => {
  const parentNodeId = nested ? 'folder' : null;
  const store = browserFlow([flowNode('folder', false, { kind: 'folder', content: '' }),
    flowNode('a', true, { parentNodeId }), flowNode('b', false, { parentNodeId })]);
  await store.getState().resumeReviewSession(now, { preferredNodeId: 'a' });
  store.getState().revealReviewAnswer();
  const actions = createWorkspaceTrashActions(store.setState, createBrowserLocalWorkspaceMutationRepository(), store.getState);
  await actions.deleteNode('a');
  await vi.waitFor(() => expect(store.getState().reviewSession.currentNodeId).toBe('b'));
  expect(store.getState().activeNodeId).toBe('b');
  expect(store.getState().trashedNodeIds).toContain('a');
  expect(store.getState().reviewSession.isAnswerRevealed).toBe(false);
  const saved = JSON.parse(localStorage.getItem('foliole-workspace-v1')!).state;
  expect(saved.reviewSession.currentNodeId).toBe('b');
  expect(saved.trashedNodeIds).toContain('a');
  expect(saved.trashedNodeDeletedAtById.a).toBe(now);
});
