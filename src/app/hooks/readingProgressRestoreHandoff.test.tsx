import { act, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('../../shared/platform/workspaceRuntimeRepository', () => ({
  hasWorkspaceRuntimeRepository: () => true,
  saveWorkspaceReadingProgressNow: vi.fn(),
  replayPendingWorkspaceDurableMutations: vi.fn(),
  replayPendingWorkspaceNodeSync: vi.fn()
}));
vi.mock('../../store/workspaceRuntimeSync', () => ({ syncReadingProgressToRuntime: vi.fn() }));

import { saveWorkspaceReadingProgressNow } from '../../shared/platform/workspaceRuntimeRepository';
import { beginWorkspaceRestoreSession, resetWorkspaceRestoreSessionForTests } from '../../store/workspaceRestoreSession';
import { syncReadingProgressToRuntime } from '../../store/workspaceRuntimeSync';

import { HookHarness } from './useReadingProgressSync.testSupport';

afterEach(() => {
  delete window.__folioleFlushPendingEditorDraftBeforeClose;
  resetWorkspaceRestoreSessionForTests();
});

it('flushes reading progress explicitly without replacing its pending acknowledgement during restore handoff', async () => {
  const view = render(<HookHarness activeNodeId="topic" isWorkspaceHydrated />);
  expect(syncReadingProgressToRuntime).toHaveBeenCalled();
  vi.mocked(syncReadingProgressToRuntime).mockClear();
  let finishEditorFlush!: (result: boolean) => void;
  window.__folioleFlushPendingEditorDraftBeforeClose = () => new Promise(resolve => { finishEditorFlush = resolve; });
  const restore = beginWorkspaceRestoreSession();
  act(() => { view.rerender(<HookHarness activeNodeId="topic" isWorkspaceHydrated browseRootNodeId="special-home" />); });
  expect(syncReadingProgressToRuntime).not.toHaveBeenCalled();
  finishEditorFlush(true);
  await expect(restore).resolves.toBe(true);
  expect(saveWorkspaceReadingProgressNow).toHaveBeenCalledOnce();
  resetWorkspaceRestoreSessionForTests();
  act(() => { view.rerender(<HookHarness activeNodeId="topic" isWorkspaceHydrated browseRootNodeId="special-inbox" />); });
  expect(syncReadingProgressToRuntime).toHaveBeenCalled();
});
