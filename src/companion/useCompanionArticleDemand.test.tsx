import { act, renderHook, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { CompanionReadableArticle } from '../shared/platform/companionReadableArticle';

import { useCompanionArticleSurface } from './useCompanionArticleSurface';
import { createCompanionArticleSnapshot, createFloatingBar, createWorkspaceSync } from './useCompanionArticleSurfaceTestSupport';
import { useCompanionReadableArticleLoader } from './useCompanionReadableArticleLoader';

const loadArticle = vi.hoisted(() => vi.fn());
vi.mock('../shared/platform/companionWorkspaceSync', () => ({
  loadCompanionReadableArticle: loadArticle
}));
vi.mock('../shared/platform/appLifecycle', () => ({ subscribeNativeAppForeground: vi.fn(async () => () => undefined) }));
vi.mock('../shared/platform/companionSyncObjects', () => ({
  saveCompanionSyncActiveViewState: vi.fn(async () => undefined),
  saveCompanionSyncNodeOpenState: vi.fn(async () => ({ last_opened_at: '2026-09-22T00:00:00Z' })),
  saveCompanionSyncNodeViewState: vi.fn(async () => undefined)
}));

it('loads only the displayed article and releases it when returning to a list', async () => {
  const snapshot = createCompanionArticleSnapshot();
  const workspace = createWorkspaceSync(snapshot);
  const floating = createFloatingBar();
  loadArticle.mockImplementation(async (_snapshot, nodeId) => ({
    ...workspace.readableArticle, nodeId, content: `Loaded ${nodeId}`
  }));
  const { result } = renderHook(() => {
    const [, setArticle] = useState<CompanionReadableArticle | null>(null);
    const loader = useCompanionReadableArticleLoader(snapshot, setArticle);
    const surface = useCompanionArticleSurface({ ...workspace, ...loader }, floating);
    return { surface, article: loader.readableArticle };
  });
  act(() => result.current.surface.handleSelectRecentArticle('article-2'));
  await waitFor(() => expect(result.current.article?.nodeId).toBe('article-2'));
  expect(result.current.surface.readableArticle?.content).toBe('Loaded article-2');
  act(() => result.current.surface.handleExitBrowseArticle());
  await waitFor(() => expect(result.current.article).toBeNull());
  expect(result.current.surface.readableArticle).toBeNull();
  const count = loadArticle.mock.calls.length;
  act(() => result.current.surface.handleTabAction('more'));
  expect(loadArticle).toHaveBeenCalledTimes(count);
});

describe('article demand routing', () => {
  it('does not demand a body for a topic displayed as a child list', () => {
    const snapshot = createCompanionArticleSnapshot();
    snapshot.nodesById['article-2']!.parentNodeId = 'article-1';
    const workspace = createWorkspaceSync(snapshot);
    const { result } = renderHook(() => useCompanionArticleSurface(workspace, createFloatingBar()));
    workspace.openReadableArticle.mockClear();
    act(() => result.current.handleSelectBrowseNode('article-1'));
    expect(result.current.browsedFolder?.nodeId).toBe('article-1');
    expect(workspace.openReadableArticle).toHaveBeenLastCalledWith(null);
  });
});
