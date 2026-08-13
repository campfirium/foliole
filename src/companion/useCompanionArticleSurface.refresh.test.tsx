import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';

import { useCompanionArticleSurface } from './useCompanionArticleSurface';

vi.mock('../shared/platform/companionSyncObjects', () => ({
  saveCompanionSyncActiveViewState: vi.fn(),
  saveCompanionSyncNodeReadingRecord: vi.fn(),
  saveCompanionSyncNodeReviewRecord: vi.fn(),
  saveCompanionSyncNodeViewState: vi.fn()
}));

function createTakeoverResponse() {
  return {
    committed_at: '2026-04-25T09:01:00.000Z',
    primary_device_epoch: 1,
    primary_device_id: 'android-test-device',
    release_ack: true as const,
    updated_by_device_id: 'android-test-device'
  };
}

function createPairingState() {
  return {
    device_id: 'android-test-device',
    device_kind: 'android-capacitor',
    device_name: 'Android companion',
    is_paired: true,
    paired_at: '2026-04-25T09:00:00.000Z',
    primary_device_id: 'android-test-device'
  };
}

function createSnapshot(overrides: Partial<WorkspaceSnapshot['nodesById'][string]> = {}): WorkspaceSnapshot {
  return {
    activeNodeId: 'article-1',
    nodeOrder: ['article-1'],
    nodesById: {
      'article-1': {
        anchorLink: null,
        content: '# First article\n\nBody',
        createdAt: '2026-04-25T08:00:00.000Z',
        hideTitleHeading: false,
        id: 'article-1',
        isTitleManual: false,
        kind: 'topic',
        parentNodeId: null,
        reading: {
          intervalDurationMs: 60000,
          intervalGrowthFactor: 1.5,
          lastHandledAt: '2026-04-25T08:00:00.000Z',
          nextAt: '2026-04-25T08:00:00.000Z',
          priority: 1,
          readingPosition: 0,
          repetitionCount: 1,
          state: 'active'
        },
        reveal: null,
        review: null,
        title: 'First article',
        updatedAt: '2026-04-25T08:00:00.000Z',
        ...overrides
      }
    },
    trashedNodeIds: [],
    untitledSequenceByParent: {}
  };
}

function createWorkspaceSync(snapshot: WorkspaceSnapshot) {
  return {
    bootstrapState: {
      booted_at: '2026-04-25T09:00:00.000Z',
      database_path: 'foliole-companionSQLite.db',
      database_ready: true,
      device_id: 'android-test-device',
      runtime_kind: 'android-capacitor' as const
    },
    checkDesktop: vi.fn(),
    clearError: vi.fn(),
    completePairing: vi.fn(),
    cancelPairing: vi.fn(),
    disconnectPairing: vi.fn(),
    desktopDiscoveries: [],
    desktopDiscovery: null,
    error: null,
    isWorkspaceSyncStateReady: true,
    pairingState: createPairingState(),
    pairingStatus: 'idle' as const,
    pendingPairRequest: null,
    pullFromDesktop: vi.fn(),
    readableArticle: null,
    replaceSnapshot: vi.fn(),
    requestPrimaryDeviceTakeover: vi.fn(async () => createTakeoverResponse()),
    refreshFromDevice: vi.fn(),
    refreshPairingState: vi.fn(async () => createPairingState()),
    removeRememberedTarget: vi.fn(),
    requestPairing: vi.fn(),
    saveEndpoint: vi.fn(),
    saveSyncOnboardingStatus: vi.fn(),
    state: {
      endpoint_url: 'http://10.0.2.2:38641',
      last_synced_at: '2026-04-25T09:00:00.000Z',
      remembered_targets: ['http://10.0.2.2:38641'],
      sync_events: [],
      sync_onboarding_status: 'completed' as const,
      workspace_snapshot: snapshot
    },
    syncConflictCount: 0,
    syncParticipation: {
      lifecycle_active: true, participating: true, sync_enabled: true, sync_paused: false
    },
    syncProgress: null,
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

describe('useCompanionArticleSurface remote refresh', () => {
  it('refreshes the selected readable article when synced node content changes', () => {
    const initialSync = createWorkspaceSync(createSnapshot());
    const { result, rerender } = renderHook(
      ({ workspaceSync }) => useCompanionArticleSurface(workspaceSync, createFloatingBar()),
      { initialProps: { workspaceSync: initialSync } }
    );

    act(() => {
      result.current.handleSelectRecentArticle('article-1');
    });
    rerender({
      workspaceSync: createWorkspaceSync(createSnapshot({
        content: '# First article\n\nUpdated remote body',
        updatedAt: '2026-04-25T09:10:00.000Z'
      }))
    });

    expect(result.current.readableArticle?.content).toContain('Updated remote body');
    expect(result.current.recentArticles[0]?.preview).toContain('Updated remote body');
  });

  it('refreshes the review queue when synced review state changes', () => {
    const dueSnapshot = createSnapshot();
    const { result, rerender } = renderHook(
      ({ workspaceSync }) => useCompanionArticleSurface(workspaceSync, createFloatingBar()),
      { initialProps: { workspaceSync: createWorkspaceSync(dueSnapshot) } }
    );

    expect(result.current.reviewSession.currentCard?.nodeId).toBe('article-1');
    rerender({
      workspaceSync: createWorkspaceSync(createSnapshot({
        reading: {
          ...dueSnapshot.nodesById['article-1']!.reading!,
          nextAt: '2099-01-01T00:00:00.000Z'
        }
      }))
    });

    expect(result.current.reviewSession.currentCard).toBeNull();
  });
});
