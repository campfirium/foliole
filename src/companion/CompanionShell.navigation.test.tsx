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

function createSurface(activeAction: 'recent' | 'review' | 'search') {
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
    const surface = createSurface('review');
    await renderShellWithSurface(surface);

    expect(screen.queryByTestId('companion-bottom-tab-bar')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Exit' })).toBeInTheDocument();
    expect(screen.getByLabelText('Later')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Exit' }));
    expect(surface.handleTabAction).toHaveBeenCalledWith('recent');
  });

  it('shows bottom navigation outside review tasks', async () => {
    await renderShellWithSurface(createSurface('recent'));

    expect(screen.getByTestId('companion-bottom-tab-bar')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Learn' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('button', { name: 'Browse' })).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByRole('button', { name: 'Capture' })).not.toBeInTheDocument();
  });

  it('switches the four primary destinations through the existing surface actions', async () => {
    const surface = createSurface('recent');
    await renderShellWithSurface(surface);

    fireEvent.click(screen.getByRole('button', { name: 'Learn' }));
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));

    expect(surface.handleTabAction).toHaveBeenCalledWith('review');
    expect(surface.handleTabAction).toHaveBeenCalledWith('search');
    expect(surface.handleTabAction).toHaveBeenCalledWith('more');
  });

  it('opens Browse directory and Add from the top bar', async () => {
    await renderShellWithSurface(createSurface('recent'));

    fireEvent.click(screen.getByRole('button', { name: 'Directory' }));
    expect(screen.getByRole('heading', { name: 'Directory' })).toBeInTheDocument();
    expect(screen.getByText('Internal topics')).toBeInTheDocument();
    expect(screen.getByText('Virtual folders')).toBeInTheDocument();
    expect(screen.getByText('External documents')).toBeInTheDocument();
    expect(screen.getByText('Root')).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: 'Browse' })[0]);
    expect(screen.getByRole('button', { name: 'Directory' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByRole('dialog', { name: 'Add' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Text' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Document' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Link' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'File' })).toBeInTheDocument();
  });

  it('opens Only Review as a Learn placeholder without mixed cards', async () => {
    await renderShellWithSurface(createSurface('review'));

    fireEvent.click(screen.getByRole('button', { name: 'Only Review' }));

    expect(screen.getByRole('heading', { name: 'Only Review' })).toBeInTheDocument();
    expect(screen.getByText('Only Review mode is ready as a separate Learn surface.')).toBeInTheDocument();
    expect(screen.queryByTestId('companion-review-card')).not.toBeInTheDocument();
  });

  it('shows Search as an independent input surface', async () => {
    await renderShellWithSurface(createSurface('search'));

    const input = screen.getByRole('searchbox', { name: 'Search topics' });
    fireEvent.change(input, { target: { value: 'queue' } });

    expect(input).toHaveValue('queue');
    expect(screen.getByRole('heading', { name: 'Results' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Explore later' })).toBeInTheDocument();
  });
});
