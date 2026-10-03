import { act, renderHook, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { invalidateCompanionReadingScope } from '../shared/platform/companion/reading/companionReadingScope';

import { deferred } from './companionContentEditingTestSupport';
import { useCompanionArticleSurface } from './useCompanionArticleSurface';
import { createCompanionArticleSnapshot, createFloatingBar, createWorkspaceSync } from './useCompanionArticleSurfaceTestSupport';

const writes = vi.hoisted(() => ({
  saveCompanionSyncActiveViewState: vi.fn(), saveCompanionSyncNodeViewState: vi.fn(),
  saveCompanionSyncNodeReadingRecord: vi.fn(async () => ({ content_hash: 'reading', object_id: 'article-2' })),
  saveCompanionSyncNodeReviewRecord: vi.fn()
}));
vi.mock('../shared/platform/companionSyncObjects', () => writes);

function setup() {
  writes.saveCompanionSyncNodeReadingRecord.mockClear();
  const workspace = createWorkspaceSync(createCompanionArticleSnapshot());
  const ui = renderHook(() => useCompanionArticleSurface(workspace, createFloatingBar()));
  return { ui, workspace };
}

it.each(['leave', 'library'] as const)('cancels a reading action waiting for content when its %s context changes', async (change) => {
  const { ui } = setup();
  await waitFor(() => expect(ui.result.current.reviewSession.currentCard).not.toBeNull());
  const save = deferred<void>();
  ui.result.current.readingActivity.flushDraft = () => save.promise;
  let action!: Promise<void>;
  act(() => { action = ui.result.current.handleReadReviewTopic(); });
  if (change === 'leave') act(() => ui.result.current.handleTabAction('recent'));
  else act(() => invalidateCompanionReadingScope());
  await act(async () => { save.resolve(); await action; });
  expect(writes.saveCompanionSyncNodeReadingRecord).not.toHaveBeenCalled();
});

it('does not replay a saved reading action or advance the resumed session when its old refresh completes', async () => {
  const { ui, workspace } = setup();
  await waitFor(() => expect(ui.result.current.reviewSession.currentCard).not.toBeNull());
  const originalId = ui.result.current.reviewSession.currentCard!.nodeId;
  const refresh = deferred<ReturnType<typeof createCompanionArticleSnapshot>>();
  workspace.refreshAfterMutation.mockResolvedValueOnce(workspace.state.workspace_snapshot).mockImplementationOnce(() => refresh.promise);
  let action!: Promise<void>;
  act(() => { action = ui.result.current.handleReadReviewTopic(); });
  await waitFor(() => expect(writes.saveCompanionSyncNodeReadingRecord).toHaveBeenCalledTimes(1));
  act(() => ui.result.current.handleTabAction('recent'));
  act(() => ui.result.current.handleTabAction('review'));
  await act(async () => { refresh.resolve(workspace.state.workspace_snapshot!); await action; });
  expect(ui.result.current.reviewSession.currentCard?.nodeId).toBe(originalId);
  expect(writes.saveCompanionSyncNodeReadingRecord).toHaveBeenCalledTimes(1);
});

it('waits for annotation confirmation and blocks reading while content editing is active', async () => {
  const { ui } = setup();
  await waitFor(() => expect(ui.result.current.reviewSession.currentCard).not.toBeNull());
  const activity = ui.result.current.readingActivity;
  act(() => activity.setEditing(true));
  await act(() => ui.result.current.handleReadReviewTopic());
  expect(writes.saveCompanionSyncNodeReadingRecord).not.toHaveBeenCalled();
  act(() => activity.setEditing(false));
  const annotation = deferred<void>();
  const pending = activity.run('selection', () => annotation.promise);
  let action!: Promise<void>;
  act(() => { action = ui.result.current.handleReadReviewTopic(); });
  expect(writes.saveCompanionSyncNodeReadingRecord).not.toHaveBeenCalled();
  await act(async () => { annotation.resolve(); await pending; await action; });
  expect(writes.saveCompanionSyncNodeReadingRecord).toHaveBeenCalledTimes(1);
});
