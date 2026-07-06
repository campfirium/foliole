import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const useCompanionWorkspaceSync = vi.fn();
const useCompanionArticleSurface = vi.fn();
const useFloatingBarVisibility = vi.fn();
const RELEASE_GATE_TEST_TIMEOUT_MS = 15_000;

vi.mock('./useCompanionWorkspaceSync', () => ({ useCompanionWorkspaceSync }));
vi.mock('./useCompanionArticleSurface', () => ({ useCompanionArticleSurface }));
vi.mock('./useFloatingBarVisibility', () => ({ useFloatingBarVisibility }));

function mockWorkspaceSync() {
  useCompanionWorkspaceSync.mockReturnValue({
    error: null,
    isWorkspaceSyncStateReady: true,
    pairingState: { is_paired: true },
    pullFromDesktop: vi.fn(),
    state: {
      endpoint_url: 'http://10.0.2.2:38641',
      sync_onboarding_status: 'completed',
      workspace_snapshot: null
    },
    status: 'idle'
  });
}

function mockBrowseSurface() {
  const reviewSession = {
    currentCard: null,
    nextFsrsDueAt: null,
    nextReadingDueAt: null,
    scheduledFsrsCount: 0,
    scheduledReadingCount: 0
  };
  useCompanionArticleSurface.mockReturnValue({
    activeAction: 'recent',
    browsedFolder: null,
    handleReadReviewTopic: vi.fn(),
    handlePostponeReviewTopic: vi.fn(),
    handleDismissReviewTopic: vi.fn(),
    handleGradeReview: vi.fn(),
    handleRevealAnswer: vi.fn(),
    handleSelectBrowseNode: vi.fn(),
    handleSelectRecentArticle: vi.fn(),
    handleTabAction: vi.fn(),
    effectiveReviewSession: reviewSession,
    isAnswerRevealed: false,
    isSubmittingGrade: false,
    isSubmittingReadingAction: false,
    readableArticle: null,
    recentArticles: [],
    readingError: null,
    reviewError: null,
    reviewSession: {
      currentCard: null,
      nextFsrsDueAt: null,
      nextReadingDueAt: null,
      scheduledFsrsCount: 0,
      scheduledReadingCount: 0
    },
    selectedBrowseNodeId: null
  });
}

describe('CompanionShell navigation visibility', () => {
  it('keeps bottom navigation visible when Browse content scrolls down', async () => {
    useFloatingBarVisibility.mockReturnValue({
      handleContainerScroll: vi.fn(),
      handleTouchEnd: vi.fn(),
      handleTouchMove: vi.fn(),
      handleTouchStart: vi.fn(),
      isVisible: false,
      revealBar: vi.fn()
    });
    mockWorkspaceSync();
    mockBrowseSurface();
    const { CompanionShell } = await import('./CompanionShell');

    render(
      <CompanionShell
        bootstrapState={{
          booted_at: '2026-04-22T09:05:00.000Z',
          database_path: 'foliole-companion-preview.db',
          database_ready: true,
          device_id: 'android-test-device',
          runtime_kind: 'android-capacitor'
        }}
      />
    );

    expect(screen.getByTestId('companion-bottom-tab-bar')).toBeInTheDocument();
  }, RELEASE_GATE_TEST_TIMEOUT_MS);
});
