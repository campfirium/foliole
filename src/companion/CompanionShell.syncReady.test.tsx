import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const useCompanionWorkspaceSync = vi.fn();
const useCompanionArticleSurface = vi.fn();
const useFloatingBarVisibility = vi.fn();

const RELEASE_GATE_TEST_TIMEOUT_MS = 15_000;

vi.mock('./useCompanionWorkspaceSync', () => ({ useCompanionWorkspaceSync }));
vi.mock('./useCompanionArticleSurface', () => ({ useCompanionArticleSurface }));
vi.mock('./useFloatingBarVisibility', () => ({ useFloatingBarVisibility }));

function mockFloatingBar() {
  useFloatingBarVisibility.mockReturnValue({
    handleContainerScroll: vi.fn(),
    handleTouchEnd: vi.fn(),
    handleTouchMove: vi.fn(),
    handleTouchStart: vi.fn(),
    isVisible: true,
    revealBar: vi.fn()
  });
}

function mockWorkspaceSync(isWorkspaceSyncStateReady: boolean) {
  useCompanionWorkspaceSync.mockReturnValue({
    error: null,
    isWorkspaceSyncStateReady,
    pairingState: { is_paired: true },
    pullFromDesktop: vi.fn(),
    state: {
      endpoint_url: 'http://10.0.2.2:38641',
      sync_onboarding_status: 'completed',
      workspace_snapshot: null
    },
    status: isWorkspaceSyncStateReady ? 'idle' : 'loading',
    syncConflictCount: 0,
    syncProgress: null
  });
}

function mockSurface() {
  useCompanionArticleSurface.mockReturnValue({
    activeAction: 'more',
    browsedFolder: null,
    handleDismissReviewTopic: vi.fn(),
    handleGradeReview: vi.fn(),
    handlePostponeReviewTopic: vi.fn(),
    handleReadReviewTopic: vi.fn(),
    handleRevealAnswer: vi.fn(),
    handleSelectBrowseNode: vi.fn(),
    handleSelectRecentArticle: vi.fn(),
    handleTabAction: vi.fn(),
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

async function renderShell() {
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
}

describe('CompanionShell sync ready gate', () => {
  it('shows sync loading content and hides bottom navigation before local state is ready', async () => {
    mockFloatingBar();
    mockWorkspaceSync(false);
    mockSurface();

    await renderShell();

    expect(screen.getByText('Opening synced workspace')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Settings' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('companion-bottom-tab-bar')).not.toBeInTheDocument();
  }, RELEASE_GATE_TEST_TIMEOUT_MS);

  it('shows settings and bottom navigation after local state is ready without a snapshot', async () => {
    mockFloatingBar();
    mockWorkspaceSync(true);
    mockSurface();

    await renderShell();

    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByTestId('companion-bottom-tab-bar')).toBeInTheDocument();
  }, RELEASE_GATE_TEST_TIMEOUT_MS);
});
