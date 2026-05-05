import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';

import { useCompanionArticleSurface } from './useCompanionArticleSurface';

function createSnapshot(): WorkspaceSnapshot {
  return {
    activeNodeId: 'article-1',
    nodeOrder: ['folder-1', 'article-1', 'article-2'],
    nodesById: {
      'folder-1': {
        anchorLink: null,
        content: '',
        createdAt: '2026-04-22T08:00:00.000Z',
        hideTitleHeading: false,
        id: 'folder-1',
        isTitleManual: false,
        kind: 'folder',
        parentNodeId: null,
        reading: null,
        reveal: null,
        review: null,
        title: 'Reading',
        updatedAt: '2026-04-22T08:00:00.000Z'
      },
      'article-1': {
        anchorLink: null,
        content: '# First article\n\nBody',
        createdAt: '2026-04-22T08:01:00.000Z',
        hideTitleHeading: false,
        id: 'article-1',
        isTitleManual: false,
        kind: 'topic',
        parentNodeId: 'folder-1',
        reading: null,
        reveal: null,
        review: null,
        title: 'First article',
        updatedAt: '2026-04-22T08:01:00.000Z'
      },
      'article-2': {
        anchorLink: null,
        content: '# Second article\n\nNext',
        createdAt: '2026-04-22T08:02:00.000Z',
        hideTitleHeading: false,
        id: 'article-2',
        isTitleManual: false,
        kind: 'topic',
        parentNodeId: 'folder-1',
        reading: null,
        reveal: null,
        review: null,
        title: 'Second article',
        updatedAt: '2026-04-22T08:02:00.000Z'
      }
    },
    trashedNodeIds: [],
    untitledSequenceByParent: {}
  };
}

function createWorkspaceSync(snapshot = createSnapshot()) {
  const state = {
    endpoint_url: 'http://10.0.2.2:38641',
    last_synced_at: '2026-04-22T08:03:00.000Z',
    workspace_snapshot: snapshot
  };

  return {
    clearError: vi.fn(),
    error: null,
    pullFromDesktop: vi.fn(async () => ({
      endpoint_url: 'http://10.0.2.2:38641',
      last_synced_at: '2026-04-22T08:03:00.000Z',
      workspace_snapshot: snapshot
    })),
    readableArticle: {
      content: '# First article\n\nBody',
      hideTitleHeading: false,
      nodeId: 'article-1',
      title: 'First article'
    },
    replaceSnapshot: vi.fn(async () => state),
    saveEndpoint: vi.fn(),
    state,
    status: 'idle' as const
  };
}

function createFloatingBar() {
  return {
    handleContainerScroll: vi.fn(),
    handleTouchEnd: vi.fn(),
    handleTouchMove: vi.fn(),
    handleTouchStart: vi.fn(),
    isVisible: true,
    revealBar: vi.fn()
  };
}

describe('useCompanionArticleSurface', () => {
  it('switches recent article selections into browse mode', () => {
    const { result } = renderHook(() => useCompanionArticleSurface(createWorkspaceSync(), createFloatingBar()));

    act(() => {
      result.current.handleSelectRecentArticle('article-2');
    });

    expect(result.current.activeAction).toBe('recent');
    expect(result.current.readableArticle?.nodeId).toBe('article-2');
    expect(result.current.selectedBrowseNodeId).toBe('article-2');
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
