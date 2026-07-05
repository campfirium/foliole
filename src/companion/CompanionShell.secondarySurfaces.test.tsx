import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const useCompanionWorkspaceSync = vi.fn();
const useCompanionArticleSurface = vi.fn();
const useFloatingBarVisibility = vi.fn();
const searchCompanionFullText = vi.fn();

vi.mock('./useCompanionWorkspaceSync', () => ({ useCompanionWorkspaceSync }));
vi.mock('./useCompanionArticleSurface', () => ({ useCompanionArticleSurface }));
vi.mock('./useFloatingBarVisibility', () => ({ useFloatingBarVisibility }));
vi.mock('../shared/platform/companionFullTextSearch', () => ({
  searchCompanionFullText: (...args: unknown[]) => searchCompanionFullText(...args)
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
    selectedBrowseNodeId: null as string | null
  };
}

function localSearchResults() {
  return {
    external: [{
      bodyStatus: 'ready',
      document_id: 'doc-1',
      excerpt: 'External alpha excerpt',
      extension: '.md',
      file_name: 'external.md',
      folder_id: 'folder-1',
      match_start: 9,
      opening_text: 'External opening',
      relative_path: 'notes/external.md',
      title: 'External Alpha',
      updated_at: '2026-06-15T08:00:00.000Z'
    }],
    pdf: [{
      attachment_id: 'attachment-1',
      excerpt: 'PDF alpha excerpt',
      match_start: 4,
      page: 2,
      page_height: null,
      page_width: null,
      text: 'PDF alpha text'
    }],
    strategy: 'word-based',
    topics: [{
      bodyStatus: 'ready',
      excerpt: 'Topic alpha excerpt',
      matchStart: 1,
      nodeId: 'topic-1',
      openingText: 'Topic opening',
      title: 'Topic Alpha',
      updatedAt: '2026-06-15T08:00:00.000Z'
    }]
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

  it('opens Only Review as a Learn placeholder without mixed cards', async () => {
    await renderShellWithSurface(createSurface('review'));

    const topOnlyReviewButton = screen.getAllByRole('button', { name: 'Only Review' }).at(0);
    if (!topOnlyReviewButton) throw new Error('missing top Only Review button');
    fireEvent.click(topOnlyReviewButton);

    expect(screen.getByRole('heading', { name: 'Only Review' })).toBeInTheDocument();
    expect(screen.getByText('Only Review mode is coming soon')).toBeInTheDocument();
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
    searchCompanionFullText.mockResolvedValue(localSearchResults());
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
    expect(screen.getByRole('searchbox', { name: 'Search topics' })).toBeInTheDocument();
  }, 15000);
});
