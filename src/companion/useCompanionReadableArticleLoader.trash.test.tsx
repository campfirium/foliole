import { act, renderHook } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import type { NativeCompanionWorkspaceSyncState } from '../../lib/platform/nativeCompanionSyncContract';
import { CompanionReadingSnapshotChanged } from '../shared/platform/companion/reading/companionReadingDemand';
import { resolveReadableCompanionArticleByNodeId, type CompanionReadableArticle } from '../shared/platform/companionReadableArticle';

import { buildCompanionTrashPreview } from './companionWorkspacePreview';
import { useCompanionWorkspaceLoaders } from './useCompanionWorkspaceLoaders';
import { createSnapshot, createSyncState } from './useCompanionWorkspaceSync.testSupport';

const mocks = vi.hoisted(() => ({ read: vi.fn(), refresh: vi.fn() }));
vi.mock('../shared/platform/companionWorkspaceSync', () => ({
  loadCompanionReadableArticle: mocks.read, loadCompanionWorkspaceSyncState: mocks.refresh
}));
vi.mock('../shared/platform/appLifecycle', () => ({ subscribeNativeAppForeground: vi.fn(async () => () => undefined) }));
vi.mock('./useCompanionVirtualFolderLoader', () => ({ useCompanionVirtualFolderLoader: () => vi.fn() }));

beforeEach(() => {
  mocks.read.mockReset();
  mocks.refresh.mockReset();
});

function renderReader(initial: NativeCompanionWorkspaceSyncState) {
  return renderHook(() => {
    const [state, setState] = useState(initial);
    const [article, setArticle] = useState<CompanionReadableArticle | null>(null);
    const loaders = useCompanionWorkspaceLoaders({ state, setState, setReadableArticle: setArticle, setError: vi.fn() });
    return { state, setState, article, ...loaders };
  });
}

it('moves the open article to Trash and through its committed write without reading it or the library again', async () => {
  const stored = createSnapshot();
  // The database read: the stored body, checked against the snapshot it was asked for.
  mocks.read.mockImplementation(async (snapshot: WorkspaceSnapshot, nodeId: string) =>
    resolveReadableCompanionArticleByNodeId(snapshot, nodeId));
  // Before the write commits the database still holds the article outside Trash, so a reread would fail its check.
  const { result } = renderReader(createSyncState(stored));
  await act(async () => { await result.current.openReadableArticle('topic-1'); });
  expect(result.current.article?.isTrashed).toBeUndefined();
  mocks.read.mockRejectedValue(new CompanionReadingSnapshotChanged());

  const show = async (snapshot: WorkspaceSnapshot) => {
    await act(async () => { result.current.setState(current => ({ ...current, workspace_snapshot: snapshot })); });
    await act(async () => { await result.current.openReadableArticle('topic-1'); });
  };
  // The preview ahead of the write, then the published write with its own Trash time.
  await show(buildCompanionTrashPreview(stored, ['topic-1'], '2026-11-22T00:00:00.000Z'));
  expect(result.current.article).toMatchObject({ nodeId: 'topic-1', isTrashed: true, content: stored.nodesById['topic-1']!.content });
  await show(buildCompanionTrashPreview(stored, ['topic-1'], '2026-11-22T00:00:00.400Z'));
  expect(result.current.article).toMatchObject({ nodeId: 'topic-1', isTrashed: true });
  // A failed write withdraws the preview and the article returns as it was.
  await show(stored);
  expect(result.current.article?.isTrashed).toBeUndefined();

  expect(mocks.read).toHaveBeenCalledTimes(1);
  expect(mocks.refresh).not.toHaveBeenCalled();
});

it('still reads an article again when its text changed together with its Trash state', async () => {
  const stored = createSnapshot();
  mocks.read.mockImplementation(async (snapshot: WorkspaceSnapshot, nodeId: string) =>
    resolveReadableCompanionArticleByNodeId(snapshot, nodeId) ?? { nodeId, content: 'trash read' });
  const { result } = renderReader(createSyncState(stored));
  await act(async () => { await result.current.openReadableArticle('topic-1'); });
  const trashed = buildCompanionTrashPreview(stored, ['topic-1'], '2026-11-22T00:00:00.000Z');
  const edited = { ...trashed, nodesById: { ...trashed.nodesById,
    'topic-1': { ...trashed.nodesById['topic-1']!, currentVersionId: 'edited-version' } } };
  await act(async () => { result.current.setState(current => ({ ...current, workspace_snapshot: edited })); });
  await act(async () => { await result.current.openReadableArticle('topic-1'); });
  expect(mocks.read).toHaveBeenCalledTimes(2);
});
