import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import {
  DEFAULT_REVIEW_SCHEDULER_SETTINGS,
  getReviewSchedulerVersion,
  hydrateCurrentReviewSchedulerSettings
} from '../features/settings/model/reviewSchedulerSettings';

import { useCompanionArticleSurface } from './useCompanionArticleSurface';

const syncObjectMock = vi.hoisted(() => ({
  saveCompanionSyncActiveViewState: vi.fn(),
  saveCompanionSyncNodeReadingRecord: vi.fn(),
  saveCompanionSyncNodeReviewRecord: vi.fn(async () => ({ content_hash: 'hash-review', object_id: 'item-1' })),
  saveCompanionSyncNodeViewState: vi.fn()
}));
const schedulerGrade = vi.hoisted(() => vi.fn());
const REVIEWED_AT = new Date(2026, 3, 22, 16, 10).toISOString();
const SCHEDULED_DUE = new Date(2026, 3, 25, 4).toISOString();
const hydratedReviewSchedulerSettings = {
  ...DEFAULT_REVIEW_SCHEDULER_SETTINGS,
  desiredRetention: 0.82,
  updatedAt: '2026-04-22T08:05:00.000Z'
};

function createTakeoverResponse() {
  return {
    committed_at: '2026-04-22T08:04:00.000Z',
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
    paired_at: '2026-04-22T08:03:00.000Z',
    primary_device_id: 'android-test-device'
  };
}

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
    disconnectPairing: vi.fn(),
    desktopDiscoveries: [],
    desktopDiscovery: null,
    error: null,
    isWorkspaceSyncStateReady: true,
    pendingPairRequest: null,
    pairingState: createPairingState(),
    pairingStatus: 'idle' as const,
    pullFromDesktop: vi.fn(),
    readableArticle: null,
    replaceSnapshot: vi.fn(async () => state),
    requestPrimaryDeviceTakeover: vi.fn(async () => createTakeoverResponse()),
    refreshFromDevice: vi.fn(async () => state),
    refreshPairingState: vi.fn(async () => createPairingState()),
    removeRememberedTarget: vi.fn(),
    requestPairing: vi.fn(),
    saveEndpoint: vi.fn(),
    saveSyncOnboardingStatus: vi.fn(async () => state),
    state,
    syncConflictCount: 0,
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

function expectFsrsReviewRecordSaved(grade: 1 | 2 | 3 | 4) {
  expect(syncObjectMock.saveCompanionSyncNodeReviewRecord).toHaveBeenCalledWith(expect.objectContaining({
    nodeId: 'item-1',
    review: expect.objectContaining({
      difficulty: 3.8,
      due: SCHEDULED_DUE,
      lastReviewAt: REVIEWED_AT,
      scheduledDays: 3
    }),
    reviewLog: expect.objectContaining({
      cardAfter: expect.objectContaining({
        difficulty: 3.8,
        due: SCHEDULED_DUE,
        last_review: REVIEWED_AT,
        scheduled_days: 3
      }),
      cardBefore: expect.objectContaining({
        difficulty: 4.2,
        due: '2026-04-22T08:00:00.000Z',
        last_review: '2026-04-20T08:00:00.000Z',
        scheduled_days: 2
      }),
      grade,
      reviewedAt: REVIEWED_AT,
      schedulerVersion: getReviewSchedulerVersion(hydratedReviewSchedulerSettings)
    })
  }));
}

describe('useCompanionArticleSurface fsrs sync', () => {
  beforeEach(() => {
    hydrateCurrentReviewSchedulerSettings(hydratedReviewSchedulerSettings);
    schedulerGrade.mockReset();
    schedulerGrade.mockResolvedValue({
      card: {
        difficulty: 3.8,
        due: '2026-04-25T08:10:00.000Z',
        elapsed_days: 0,
        lapses: 0,
        last_review: REVIEWED_AT,
        reps: 4,
        scheduled_days: 3,
        stability: 3.4,
        state: 2
      },
      reviewed_at: REVIEWED_AT
    });
    syncObjectMock.saveCompanionSyncNodeReviewRecord.mockClear();
  });

  it.each([1, 2, 3, 4] as const)('persists FSRS grade %s with a review log draft', async (grade) => {
    const workspaceSync = createWorkspaceSync();
    const { result } = renderHook(() => useCompanionArticleSurface(workspaceSync, createFloatingBar()));

    await act(async () => {
      await result.current.handleGradeReview(grade);
    });

    expectFsrsReviewRecordSaved(grade);
    expect(syncObjectMock.saveCompanionSyncNodeReviewRecord.mock.invocationCallOrder[0]!)
      .toBeLessThan(workspaceSync.replaceSnapshot.mock.invocationCallOrder[0]!);
  });

  it('does not replace the companion snapshot when fsrs review persistence is unavailable', async () => {
    syncObjectMock.saveCompanionSyncNodeReviewRecord.mockResolvedValueOnce(null as never);
    const workspaceSync = createWorkspaceSync();
    const { result } = renderHook(() => useCompanionArticleSurface(workspaceSync, createFloatingBar()));

    await act(async () => {
      await result.current.handleGradeReview(3);
    });

    expect(workspaceSync.replaceSnapshot).not.toHaveBeenCalled();
    expect(result.current.reviewError).toBe('Failed to persist the review grade.');
  });

  it('ignores duplicate fsrs review submissions while persistence is in flight', async () => {
    const workspaceSync = createWorkspaceSync();
    const { result } = renderHook(() => useCompanionArticleSurface(workspaceSync, createFloatingBar()));

    await act(async () => {
      const first = result.current.handleGradeReview(3);
      const second = result.current.handleGradeReview(3);
      await Promise.all([first, second]);
    });

    expect(syncObjectMock.saveCompanionSyncNodeReviewRecord).toHaveBeenCalledTimes(1);
    expect(workspaceSync.replaceSnapshot).toHaveBeenCalledTimes(1);
  });
});
