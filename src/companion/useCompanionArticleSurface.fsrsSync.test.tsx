import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';

import { useCompanionArticleSurface } from './useCompanionArticleSurface';

const syncObjectMock = vi.hoisted(() => ({
  saveCompanionSyncActiveViewState: vi.fn(),
  saveCompanionSyncNodeReadingRecord: vi.fn(),
  saveCompanionSyncNodeReviewRecord: vi.fn(async () => ({ content_hash: 'hash-review', object_id: 'item-1' })),
  saveCompanionSyncNodeViewState: vi.fn()
}));
const schedulerGrade = vi.hoisted(() => vi.fn());

vi.mock('../shared/platform/companionSyncObjects', () => syncObjectMock);
vi.mock('../features/review/model/reviewSchedulerFactory', () => ({
  createReviewSchedulerAdapter: () => ({ grade: schedulerGrade })
}));

function createSnapshot(): WorkspaceSnapshot {
  return {
    activeNodeId: 'item-1',
    nodeOrder: ['item-1'],
    nodesById: {
      'item-1': {
        anchorLink: null,
        content: 'Question prompt',
        createdAt: '2026-04-22T08:00:00.000Z',
        hideTitleHeading: false,
        id: 'item-1',
        isTitleManual: false,
        kind: 'item',
        parentNodeId: null,
        reading: null,
        reveal: 'Answer',
        review: {
          difficulty: 4.2,
          due: '2026-04-22T08:00:00.000Z',
          elapsedDays: 2,
          lapses: 0,
          lastReviewAt: '2026-04-20T08:00:00.000Z',
          reps: 3,
          scheduledDays: 2,
          stability: 2.1,
          state: 2
        },
        title: 'Card one',
        updatedAt: '2026-04-22T08:00:00.000Z'
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
    remembered_targets: ['http://10.0.2.2:38641'],
    sync_events: [],
    sync_onboarding_status: 'completed' as const,
    workspace_snapshot: snapshot
  };
  return {
    bootstrapState: {
      booted_at: '2026-04-22T08:03:00.000Z',
      database_path: 'foliole-companion-preview.db',
      database_ready: true,
      device_id: 'android-test-device',
      device_name: 'Android companion',
      runtime_kind: 'android-capacitor' as const
    },
    checkDesktop: vi.fn(),
    clearError: vi.fn(),
    completePairing: vi.fn(),
    cancelPairing: vi.fn(),
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
    pullFromDesktop: vi.fn(),
    readableArticle: null,
    replaceSnapshot: vi.fn(async () => state),
    removeRememberedTarget: vi.fn(),
    requestPairing: vi.fn(),
    saveEndpoint: vi.fn(),
    saveSyncOnboardingStatus: vi.fn(async () => state),
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

describe('useCompanionArticleSurface fsrs sync', () => {
  beforeEach(() => {
    schedulerGrade.mockReset();
    schedulerGrade.mockResolvedValue({
      card: {
        difficulty: 3.8,
        due: '2026-04-25T08:10:00.000Z',
        elapsed_days: 0,
        lapses: 0,
        last_review: '2026-04-22T08:10:00.000Z',
        reps: 4,
        scheduled_days: 3,
        stability: 3.4,
        state: 2
      },
      reviewed_at: '2026-04-22T08:10:00.000Z'
    });
    syncObjectMock.saveCompanionSyncNodeReviewRecord.mockClear();
  });

  it('persists fsrs review grades with a review log draft', async () => {
    const workspaceSync = createWorkspaceSync();
    const { result } = renderHook(() => useCompanionArticleSurface(workspaceSync, createFloatingBar()));

    await act(async () => {
      await result.current.handleGradeReview(3);
    });

    expect(syncObjectMock.saveCompanionSyncNodeReviewRecord).toHaveBeenCalledWith(expect.objectContaining({
      nodeId: 'item-1',
      reviewLog: expect.objectContaining({ grade: 3, reviewedAt: '2026-04-22T08:10:00.000Z' })
    }));
    expect(syncObjectMock.saveCompanionSyncNodeReviewRecord.mock.invocationCallOrder[0])
      .toBeLessThan(workspaceSync.replaceSnapshot.mock.invocationCallOrder[0]);
  });
});
