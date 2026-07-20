import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { createCompanionSearchResultsFixture } from './companionSearchTestFixtures';

const useCompanionWorkspaceSync = vi.fn();
const useCompanionArticleSurface = vi.fn();
const useFloatingBarVisibility = vi.fn();
const searchCompanionFullText = vi.fn();

vi.mock('./useCompanionWorkspaceSync', () => ({ useCompanionWorkspaceSync }));
vi.mock('./useCompanionArticleSurface', () => ({ useCompanionArticleSurface }));
vi.mock('./useFloatingBarVisibility', () => ({ useFloatingBarVisibility }));
vi.mock('../shared/platform/companionFullTextSearch', () => ({
  searchCompanionFullText: (...args: unknown[]) => searchCompanionFullText(...args),
  supportsCompanionExtendedSearch: () => true
}));

vi.mock('./CompanionReviewCard', () => ({
  CompanionReviewAnswer: () => <div data-testid="companion-review-answer" />,
  CompanionReviewCard: () => <div data-testid="companion-review-card" />
}));

vi.mock('./CompanionArticleDocument', () => ({
  CompanionArticleDocument: (props: { content: string }) => (
    <article data-testid="companion-article-document">{props.content}</article>
  )
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

function createSurface(activeAction: 'recent' | 'review' | 'search') {
  const reviewSession = {
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
    queueNodeIds: activeAction === 'review' ? ['topic-1'] : [],
    scheduledFsrsCount: 0,
    scheduledReadingCount: activeAction === 'review' ? 1 : 0,
    totalCount: activeAction === 'review' ? 1 : 0
  };
  const onlyReviewSession = {
    currentCard: null,
    nextFsrsDueAt: null,
    nextReadingDueAt: reviewSession.nextReadingDueAt,
    queueNodeIds: [],
    scheduledFsrsCount: 0,
    scheduledReadingCount: reviewSession.scheduledReadingCount,
    totalCount: 0
  };
  return {
    activeAction,
    browsedFolder: null,
    handleReadReviewTopic: vi.fn(),
    handlePostponeReviewTopic: vi.fn(),
    handleDismissReviewTopic: vi.fn(),
    handleGradeReview: vi.fn(),
    handleRevealAnswer: vi.fn(),
    handleExitSearchArticle: vi.fn(),
    handleSelectBrowseNode: vi.fn(),
    handleSelectRecentArticle: vi.fn(),
    handleTabAction: vi.fn(),
    isAnswerRevealed: false,
    isSubmittingGrade: false,
    isSubmittingReadingAction: false,
    readableArticle: null as null | Record<string, unknown>,
    recentArticles: [],
    readingError: null,
    reviewError: null,
    effectiveReviewSession: reviewSession,
    onlyReviewSession,
    reviewSession,
    selectedBrowseNodeId: null as string | null
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

function makeSearchSurfaceOpenReadable(surface: ReturnType<typeof createSurface>) {
  surface.handleSelectBrowseNode = vi.fn((nodeId: string) => {
    surface.activeAction = 'recent';
    surface.readableArticle = {
      content: '# Topic Alpha\n\nSearch-opened body',
      hideTitleHeading: false,
      nodeId,
      persistedNodeViewState: null,
      pdfAttachmentId: null,
      textAnchorDecorations: [],
      title: 'Topic Alpha'
    };
    surface.selectedBrowseNodeId = nodeId;
  });
  surface.handleExitSearchArticle = vi.fn(() => {
    surface.activeAction = 'search';
    surface.readableArticle = null;
    surface.selectedBrowseNodeId = null;
  });
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
    expect(screen.getByRole('heading', { name: 'Directory' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open folder Trash' })).toBeInTheDocument();

    fireEvent.click(within(bottomBar).getByRole('button', { name: 'Browse' }));
    expect(within(bottomBar).getByRole('button', { name: 'Browse' })).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByRole('button', { name: 'Open folder Trash' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Capture' }));
    expectCaptureSheet();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    expectBrowseMenuSheet();
  }, 15000);

  it('opens Only Review as an FSRS-only empty state without mixed cards', async () => {
    await renderShellWithSurface(createSurface('review'));

    const topOnlyReviewButton = screen.getAllByRole('button', { name: 'Only Review' }).at(0);
    if (!topOnlyReviewButton) throw new Error('missing top Only Review button');
    fireEvent.click(topOnlyReviewButton);

    expect(screen.getByText('No topics synced yet')).toBeInTheDocument();
    expect(screen.getByText('Connect to desktop to bring review work onto this device.')).toBeInTheDocument();
    expect(screen.queryByTestId('companion-review-card')).not.toBeInTheDocument();
  }, 15000);

  it('shows Search as an independent input surface', async () => {
    searchCompanionFullText.mockResolvedValue({ external: [], pdf: [], strategy: 'word-based', topics: [] });

    await renderShellWithSurface(createSurface('search'));

    const input = screen.getByRole('searchbox', { name: 'Search topics' });
    fireEvent.change(input, { target: { value: 'queue' } });

    expect(input).toHaveValue('queue');
    expect(input).toBeEnabled();
    expect(await screen.findByText('No local results found.')).toBeInTheDocument();
  });

});

describe('CompanionShell search topic routing', () => {
  it('opens a search topic through the readable article path and exits back to Search', async () => {
    searchCompanionFullText.mockResolvedValue(createCompanionSearchResultsFixture());
    const surface = createSurface('search');
    makeSearchSurfaceOpenReadable(surface);

    await renderShellWithSurface(surface);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search topics' }), { target: { value: 'alpha' } });
    fireEvent.click(await screen.findByRole('button', { name: /Topic Alpha/u }));

    expect(surface.handleSelectBrowseNode).toHaveBeenCalledWith('topic-1');
    expect(await screen.findByText(/Search-opened body/u)).toBeInTheDocument();
    fireEvent.click(screen.getByText(/Search-opened body/u));
    fireEvent.click(screen.getByRole('button', { name: 'Exit' }));

    expect(surface.handleExitSearchArticle).toHaveBeenCalled();
    expect(screen.getByRole('searchbox', { name: 'Search topics' })).toHaveValue('alpha');
  }, 15000);

  it('opens an external search result in the shared reader and exits back to Search', async () => {
    searchCompanionFullText.mockResolvedValue(createCompanionSearchResultsFixture());
    const surface = createSurface('search');

    await renderShellWithSurface(surface);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search topics' }), { target: { value: 'alpha' } });
    fireEvent.click(await screen.findByRole('button', { name: /External Alpha/u }));

    expect(await screen.findByText(/External search-opened body/u)).toBeInTheDocument();
    expect(screen.queryByTestId('companion-bottom-tab-bar')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText(/External search-opened body/u));
    fireEvent.click(screen.getByRole('button', { name: 'Exit' }));

    expect(screen.getByRole('searchbox', { name: 'Search topics' })).toHaveValue('alpha');
  }, 15000);
});
