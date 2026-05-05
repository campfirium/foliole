import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const useCompanionWorkspaceSync = vi.fn();
const useCompanionArticleSurface = vi.fn();
const useFloatingBarVisibility = vi.fn();

vi.mock('./useCompanionWorkspaceSync', () => ({ useCompanionWorkspaceSync }));
vi.mock('./useCompanionArticleSurface', () => ({ useCompanionArticleSurface }));
vi.mock('./useFloatingBarVisibility', () => ({ useFloatingBarVisibility }));

vi.mock('./CompanionReviewCard', () => ({
  CompanionReviewAnswer: () => <div data-testid="companion-review-answer" />,
  CompanionReviewCard: () => <div data-testid="companion-review-card" />
}));

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

function mockWorkspaceSync() {
  useCompanionWorkspaceSync.mockReturnValue({
    error: null,
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

function createSurface(activeAction: 'recent' | 'review') {
  return {
    activeAction,
    browsedFolder: null,
    handleCompleteReviewItem: vi.fn(),
    handleDeferReviewItem: vi.fn(),
    handleDismissReviewItem: vi.fn(),
    handleGradeReview: vi.fn(),
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
      currentCard: activeAction === 'review'
        ? {
            content: 'Readable topic body',
            itemKind: 'reading',
            nodeId: 'topic-1',
            title: 'Readable article'
          }
        : null,
      nextFsrsDueAt: null,
      nextReadingDueAt: null,
      scheduledFsrsCount: 0,
      scheduledReadingCount: 0
    },
    selectedBrowseNodeId: null
  };
}

async function renderShellWithSurface(surface: ReturnType<typeof createSurface>) {
  mockFloatingBar();
  mockWorkspaceSync();
  useCompanionArticleSurface.mockReturnValue(surface);
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

describe('CompanionShell navigation', () => {
  it('replaces bottom navigation with review actions during a review task', async () => {
    await renderShellWithSurface(createSurface('review'));

    expect(screen.queryByTestId('companion-bottom-tab-bar')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Later')).toBeInTheDocument();
  });

  it('shows bottom navigation outside review tasks', async () => {
    await renderShellWithSurface(createSurface('recent'));

    expect(screen.getByTestId('companion-bottom-tab-bar')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Review' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('button', { name: 'Recent' })).toHaveAttribute('aria-current', 'page');
  });

  it('opens capture as a bottom sheet without switching tabs', async () => {
    const surface = createSurface('recent');
    await renderShellWithSurface(surface);

    fireEvent.click(screen.getByRole('button', { name: 'Capture' }));

    expect(screen.getByRole('dialog', { name: 'Capture' })).toBeInTheDocument();
    expect(surface.handleTabAction).not.toHaveBeenCalledWith('capture');
  });
});
