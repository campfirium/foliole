import { fireEvent, render, screen, within } from '@testing-library/react';
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
    handleReadReviewTopic: vi.fn(),
    handlePostponeReviewTopic: vi.fn(),
    handleDismissReviewTopic: vi.fn(),
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

async function renderShellWithSurface(surface: unknown) {
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

function expectCaptureSheet() {
  expect(screen.getByRole('dialog', { name: 'Capture' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: 'Capture text' })).toBeInTheDocument();
  expect(screen.getByText('Paste from Clipboard')).toBeInTheDocument();
  expect(screen.getByText('Upload File')).toBeInTheDocument();
}

function expectBrowseMenuSheet() {
  expect(screen.getByRole('dialog', { name: 'Browse menu' })).toBeInTheDocument();
  expect(screen.getByText('Sort')).toBeInTheDocument();
  expect(screen.getByText('Theme')).toBeInTheDocument();
}

describe('CompanionShell secondary surfaces', () => {
  it('opens Browse directory and Capture from the top bar', async () => {
    await renderShellWithSurface(createSurface('recent'));

    const bottomBar = screen.getByTestId('companion-bottom-tab-bar');
    fireEvent.click(within(bottomBar).getByRole('button', { name: 'Directory' }));
    expect(screen.queryByRole('heading', { name: 'Directory' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open folder Trash' })).toBeInTheDocument();

    fireEvent.click(within(bottomBar).getByRole('button', { name: 'Browse' }));
    expect(within(bottomBar).getByRole('button', { name: 'Browse' })).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByRole('button', { name: 'Open folder Trash' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Capture' }));
    expectCaptureSheet();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    expectBrowseMenuSheet();
  });

  it('opens Only Review as a Learn placeholder without mixed cards', async () => {
    await renderShellWithSurface(createSurface('review'));

    fireEvent.click(screen.getByRole('button', { name: 'Only Review' }));

    expect(screen.getByRole('heading', { name: 'Only Review' })).toBeInTheDocument();
    expect(screen.getByText('Only Review mode is coming soon')).toBeInTheDocument();
    expect(screen.queryByTestId('companion-review-card')).not.toBeInTheDocument();
  });

  it('shows Search as an independent input surface', async () => {
    await renderShellWithSurface(createSurface('search'));

    const input = screen.getByRole('searchbox', { name: 'Search topics' });
    fireEvent.change(input, { target: { value: 'queue' } });

    expect(input).toHaveValue('queue');
    expect(input).toBeDisabled();
    expect(screen.getByText('Search is coming soon')).toBeInTheDocument();
  });
});
