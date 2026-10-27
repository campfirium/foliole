// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { installBrowserDailyFlowRuntime } from '../shared/platform/runtime/dailyFlowBrowserRuntime';
import { installWorkspaceBrowserCommit } from '../store/workspaceBrowserCommit';
import { createInitialWorkspaceState, useWorkspaceStore as store, WORKSPACE_STORAGE_KEY } from '../store/workspaceStore';

import { installDemoWorkspaceSnapshot } from './demoWorkspaceSnapshot';

const now = '2026-06-17T00:10:00.000Z';
beforeEach(async () => {
  installWorkspaceBrowserCommit({ save() {} });
  installBrowserDailyFlowRuntime(null);
  store.setState(createInitialWorkspaceState(new Date(now)));
  installWorkspaceBrowserCommit(null);
  localStorage.clear();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(now));
  await installDemoWorkspaceSnapshot('/en/demo/');
  await store.getState().startReviewSession(now);
});
afterEach(() => { installWorkspaceBrowserCommit(null); installBrowserDailyFlowRuntime(null); vi.restoreAllMocks(); vi.useRealTimers(); });

it('keeps the displayed task and learning facts when the browser rejects a Read save', async () => {
  const before = store.getState();
  const raw = localStorage.getItem(WORKSPACE_STORAGE_KEY);
  vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => { throw new Error('disk full'); });
  await store.getState().readReviewTopic(now).catch(() => false);
  expect(store.getState().reviewSession).toEqual(before.reviewSession);
  expect(store.getState().nodesById).toEqual(before.nodesById);
  expect(store.getState().appActionHistory).toEqual(before.appActionHistory);
  expect(localStorage.getItem(WORKSPACE_STORAGE_KEY)).toBe(raw);
});
