import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useCompanionArticleSurface } from './useCompanionArticleSurface';
import {
  createCompanionArticleSnapshot,
  createFloatingBar,
  createUnpairedWorkspaceSync,
  createWorkspaceSync
} from './useCompanionArticleSurfaceTestSupport';

const syncObjectMock = vi.hoisted(() => ({
  saveCompanionSyncActiveViewState: vi.fn(async () => ({ content_hash: 'hash-active', object_id: 'active' })),
  saveCompanionSyncNodeReadingRecord: vi.fn(async () => ({ content_hash: 'hash-reading', object_id: 'article-1' })),
  saveCompanionSyncNodeReviewRecord: vi.fn(async () => ({ content_hash: 'hash-review', object_id: 'item-1' })),
  saveCompanionSyncNodeViewState: vi.fn(async () => ({ content_hash: 'hash-view', object_id: 'view' }))
}));
const desktopSyncMock = vi.hoisted(() => ({
  syncCompanionContentBlobFromDesktop: vi.fn(async () => ({ availability: 'cached', hash: 'hash' }))
}));

vi.mock('../shared/platform/companionSyncObjects', () => syncObjectMock);
vi.mock('../shared/platform/companionDesktopSyncObjects', () => desktopSyncMock);

const readingActions = [
  ['read', 'handleReadReviewTopic'],
  ['later', 'handlePostponeReviewTopic'],
  ['dismiss', 'handleDismissReviewTopic']
] as const;
type ReadingActionMethod = typeof readingActions[number][1];
type CompanionArticleSurface = ReturnType<typeof useCompanionArticleSurface>;

function createReadingArticleSnapshot() {
  const snapshot = createCompanionArticleSnapshot();
  snapshot.nodesById['article-1'] = {
    ...snapshot.nodesById['article-1']!,
    reading: {
      intervalDurationMs: 60000,
      intervalGrowthFactor: 1.5,
      lastHandledAt: '2026-04-22T07:00:00.000Z',
      nextAt: '2026-04-22T08:00:00.000Z',
      priority: 1,
      readingPosition: 0,
      repetitionCount: 1,
      state: 'active'
    }
  };
  return snapshot;
}

async function invokeReadingAction(surface: CompanionArticleSurface, method: ReadingActionMethod) {
  await surface[method]();
}

async function expectReadingReviewActionPersists(method: ReadingActionMethod) {
  const snapshot = createReadingArticleSnapshot();
  const workspaceSync = createWorkspaceSync(snapshot);
  const { result } = renderHook(() => useCompanionArticleSurface(workspaceSync, createFloatingBar()));

  await act(async () => {
    await invokeReadingAction(result.current, method);
  });

  expect(workspaceSync.replaceSnapshot).toHaveBeenCalledWith(expect.any(Object), 'article-1');
  expect(syncObjectMock.saveCompanionSyncNodeReadingRecord).toHaveBeenCalledWith(expect.objectContaining({
    nodeId: 'article-1'
  }));
  expect(syncObjectMock.saveCompanionSyncNodeReadingRecord.mock.invocationCallOrder[0]!)
    .toBeLessThan(workspaceSync.replaceSnapshot.mock.invocationCallOrder[0]!);
}

describe('useCompanionArticleSurface', () => {
  beforeEach(() => {
    vi.useRealTimers();
    syncObjectMock.saveCompanionSyncActiveViewState.mockClear();
    syncObjectMock.saveCompanionSyncNodeReadingRecord.mockClear();
    syncObjectMock.saveCompanionSyncNodeReadingRecord.mockResolvedValue({ content_hash: 'hash-reading', object_id: 'article-1' });
    syncObjectMock.saveCompanionSyncNodeReviewRecord.mockClear();
    syncObjectMock.saveCompanionSyncNodeViewState.mockClear();
    desktopSyncMock.syncCompanionContentBlobFromDesktop.mockClear();
    desktopSyncMock.syncCompanionContentBlobFromDesktop.mockResolvedValue({ availability: 'cached', hash: 'hash' });
  });

  it('opens the connection page first when the phone has no desktop content yet', () => {
    const { result } = renderHook(() => useCompanionArticleSurface(createUnpairedWorkspaceSync(), createFloatingBar()));

    expect(result.current.activeAction).toBe('more');
  });

});

describe('useCompanionArticleSurface browsing', () => {
  it('switches recent article selections into browse mode', () => {
    const { result } = renderHook(() => useCompanionArticleSurface(createWorkspaceSync(), createFloatingBar()));

    act(() => {
      result.current.handleSelectRecentArticle('article-2');
    });

    expect(result.current.activeAction).toBe('recent');
    expect(result.current.readableArticle?.nodeId).toBe('article-2');
    expect(result.current.selectedBrowseNodeId).toBe('article-2');
    expect(syncObjectMock.saveCompanionSyncActiveViewState).toHaveBeenCalledWith('article-2');
  });

  it('marks opened browse topics as last opened in the local snapshot', async () => {
    const workspaceSync = createWorkspaceSync();
    const { result } = renderHook(() => useCompanionArticleSurface(workspaceSync, createFloatingBar()));

    act(() => {
      result.current.handleSelectRecentArticle('article-2');
    });

    await waitFor(() => expect(syncObjectMock.saveCompanionSyncNodeViewState).toHaveBeenCalledWith({
      nodeId: 'article-2',
      scrollTop: 0
    }));
    expect(workspaceSync.replaceSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        persistedNodeViewById: expect.objectContaining({
          'article-2': expect.objectContaining({ nodeId: 'article-2' })
        })
      }),
      'article-2'
    );
  });

  it('marks the selected missing body as loading while direct body sync runs', async () => {
    desktopSyncMock.syncCompanionContentBlobFromDesktop.mockReturnValue(new Promise(() => undefined));
    const snapshot = createCompanionArticleSnapshot();
    snapshot.nodesById['article-2'] = {
      ...snapshot.nodesById['article-2']!,
      bodyBlobHash: 'b'.repeat(64),
      bodyStatus: 'missing',
      content: ''
    };
    const workspaceSync = createWorkspaceSync(snapshot);
    const { result } = renderHook(() => useCompanionArticleSurface(workspaceSync, createFloatingBar()));

    act(() => {
      result.current.handleSelectRecentArticle('article-2');
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(desktopSyncMock.syncCompanionContentBlobFromDesktop).toHaveBeenCalledWith(
      'http://10.0.2.2:38641',
      'b'.repeat(64)
    );
    expect(result.current.readableArticle?.bodyStatus).toBe('fetching');
  });
});

describe('useCompanionArticleSurface browse state', () => {
  it('keeps the current readable article available when snapshot recent rows are empty', () => {
    const { result } = renderHook(() => useCompanionArticleSurface(createWorkspaceSync(null), createFloatingBar()));

    expect(result.current.recentArticles).toEqual([{
      nodeId: 'article-1',
      preview: null,
      title: 'First article',
      updatedAt: ''
    }]);
  });

  it('persists companion scroll view state after scroll settles', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useCompanionArticleSurface(createWorkspaceSync(), createFloatingBar()));

    act(() => {
      result.current.handleSelectRecentArticle('article-2');
    });
    act(() => {
      result.current.handleViewScroll(128);
      vi.advanceTimersByTime(800);
    });

    expect(syncObjectMock.saveCompanionSyncNodeViewState).toHaveBeenCalledWith({
      nodeId: 'article-2',
      scrollTop: 128
    });
  });

  it('opens topic containers as browse surfaces while keeping leaf topics readable', () => {
    const snapshot = createCompanionArticleSnapshot();
    snapshot.nodesById['article-3'] = {
      ...snapshot.nodesById['article-2']!,
      content: '# Child\n\nNested body',
      id: 'article-3',
      parentNodeId: 'article-2',
      title: 'Nested child'
    };
    snapshot.nodeOrder.push('article-3');
    const { result } = renderHook(() => useCompanionArticleSurface(createWorkspaceSync(snapshot), createFloatingBar()));

    act(() => result.current.handleSelectBrowseNode('article-2'));
    expect(result.current.browsedFolder?.nodeId).toBe('article-2');
    expect(result.current.browsedFolder?.items.map((item) => item.nodeId)).toEqual(['article-3']);

    act(() => result.current.handleSelectBrowseNode('article-1'));
    expect(result.current.browsedFolder).toBeNull();
    expect(result.current.readableArticle?.nodeId).toBe('article-1');
  });
  it('opens folder breadcrumbs as folder browse surfaces', () => {
    const { result } = renderHook(() => useCompanionArticleSurface(createWorkspaceSync(), createFloatingBar()));

    act(() => {
      result.current.handleSelectBrowseNode('folder-1');
    });

    expect(result.current.activeAction).toBe('recent');
    expect(result.current.browsedFolder?.nodeId).toBe('folder-1');
    expect(result.current.readableArticle).toBeNull();
  });

});

describe('useCompanionArticleSurface reading review persistence', () => {
  it.each(readingActions)('persists %s review actions as single-node companion updates', async (_label, method) => {
    await expectReadingReviewActionPersists(method);
  });

  it.each(readingActions)('does not replace the snapshot when %s persistence fails', async (_label, method) => {
    syncObjectMock.saveCompanionSyncNodeReadingRecord.mockResolvedValueOnce(null as never);
    const snapshot = createReadingArticleSnapshot();
    const workspaceSync = createWorkspaceSync(snapshot);
    const { result } = renderHook(() => useCompanionArticleSurface(workspaceSync, createFloatingBar()));

    await act(async () => {
      await invokeReadingAction(result.current, method);
    });

    expect(workspaceSync.replaceSnapshot).not.toHaveBeenCalled();
    expect(result.current.readingError).toBe('Failed to persist the reading topic.');
  });

  it.each(readingActions)('ignores duplicate %s actions while persistence is in flight', async (_label, method) => {
    const snapshot = createReadingArticleSnapshot();
    const workspaceSync = createWorkspaceSync(snapshot);
    const { result } = renderHook(() => useCompanionArticleSurface(workspaceSync, createFloatingBar()));
    syncObjectMock.saveCompanionSyncNodeReadingRecord.mockClear();

    await act(async () => {
      const first = invokeReadingAction(result.current, method);
      const second = invokeReadingAction(result.current, method);
      await Promise.all([first, second]);
    });

    expect(syncObjectMock.saveCompanionSyncNodeReadingRecord).toHaveBeenCalledTimes(1);
    expect(workspaceSync.replaceSnapshot).toHaveBeenCalledTimes(1);
  });

});
