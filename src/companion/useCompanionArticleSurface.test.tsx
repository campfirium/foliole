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

function createWorkspaceSync(snapshot: WorkspaceSnapshot | null = createSnapshot()) {
  const state = {
    endpoint_url: 'http://10.0.2.2:38641',
    last_synced_at: '2026-04-22T08:03:00.000Z',
    remembered_targets: ['http://10.0.2.2:38641'],
    sync_onboarding_status: 'completed' as const,
    workspace_snapshot: snapshot
  };

  return {
    bootstrapState: {
      booted_at: '2026-04-22T08:03:00.000Z',
      database_path: 'foliole-companion-preview.db',
      database_ready: true,
      device_id: 'android-test-device',
      runtime_kind: 'android-capacitor' as const
    },
    checkDesktop: vi.fn(),
    clearError: vi.fn(),
    completePairing: vi.fn(),
    desktopDiscoveries: [],
    desktopDiscovery: null,
    error: null,
    pendingPairRequest: null,
    pairingState: {
      device_id: 'android-test-device',
      device_kind: 'android-capacitor',
      device_name: 'Android companion',
      is_paired: true,
      paired_at: '2026-04-22T08:03:00.000Z'
    },
    pairingStatus: 'idle' as const,
    pullFromDesktop: vi.fn(async () => ({
      endpoint_url: 'http://10.0.2.2:38641',
      last_synced_at: '2026-04-22T08:03:00.000Z',
      remembered_targets: ['http://10.0.2.2:38641'],
      sync_onboarding_status: 'completed' as const,
      workspace_snapshot: snapshot
    })),
    readableArticle: {
      content: '# First article\n\nBody',
      hideTitleHeading: false,
      nodeId: 'article-1',
      textAnchorDecorations: [],
      title: 'First article'
    },
    replaceSnapshot: vi.fn(async () => state),
    removeRememberedTarget: vi.fn(),
    requestPairing: vi.fn(),
    saveSyncOnboardingStatus: vi.fn(async () => state),
    saveEndpoint: vi.fn(),
    state,
    status: 'idle' as const
  };
}

function createUnpairedWorkspaceSync() {
  return {
    ...createWorkspaceSync(null),
    pairingState: {
      device_id: 'android-test-device',
      device_kind: 'android-capacitor',
      device_name: 'Android companion',
      is_paired: false,
      paired_at: null
    },
    readableArticle: null,
    state: {
      endpoint_url: null,
      last_synced_at: null,
      remembered_targets: [],
      sync_onboarding_status: 'pending' as const,
      workspace_snapshot: null
    }
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
  it('opens the connection page first when the phone has no desktop content yet', () => {
    const { result } = renderHook(() => useCompanionArticleSurface(createUnpairedWorkspaceSync(), createFloatingBar()));

    expect(result.current.activeAction).toBe('more');
  });

  it('opens sync setup from the initial prompt without dismissing future prompts', async () => {
    const workspaceSync = createUnpairedWorkspaceSync();
    const { result } = renderHook(() => useCompanionArticleSurface(workspaceSync, createFloatingBar()));

    await act(async () => {
      await result.current.handleStartSyncOnboarding();
    });

    expect(workspaceSync.saveSyncOnboardingStatus).not.toHaveBeenCalled();
    expect(result.current.activeAction).toBe('more');
  });

  it('persists the initial sync prompt dismissal', async () => {
    const workspaceSync = createUnpairedWorkspaceSync();
    const { result } = renderHook(() => useCompanionArticleSurface(workspaceSync, createFloatingBar()));

    await act(async () => {
      await result.current.handleDismissSyncOnboarding();
    });

    expect(workspaceSync.saveSyncOnboardingStatus).toHaveBeenCalledWith('dismissed');
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

  it('persists reading review actions as single-node companion updates', async () => {
    const snapshot = createSnapshot();
    snapshot.nodesById['article-1'] = {
      ...snapshot.nodesById['article-1'],
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
    const workspaceSync = createWorkspaceSync(snapshot);
    const { result } = renderHook(() => useCompanionArticleSurface(workspaceSync, createFloatingBar()));

    await act(async () => {
      await result.current.handleCompleteReviewItem();
    });

    expect(workspaceSync.replaceSnapshot).toHaveBeenCalledWith(expect.any(Object), 'article-1');
  });
});
