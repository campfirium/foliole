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

vi.mock('./CompanionArticleDocument', () => ({
  CompanionArticleDocument: (props: {
    content: string;
    readingSelection?: { from: number; to: number } | null;
  }) => (
    <article
      data-reading-from={props.readingSelection?.from ?? ''}
      data-reading-to={props.readingSelection?.to ?? ''}
      data-testid="companion-article-document"
    >
      {props.content}
    </article>
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

function createReadableSurface() {
  return {
    ...createSurface('recent'),
    readableArticle: {
      content: '# Readable article\n\nReadable topic body',
      hideTitleHeading: false,
      nodeId: 'topic-1',
      pdfAttachmentId: 'pdf-1',
      textAnchorDecorations: [],
      title: 'Readable article'
    },
    selectedBrowseNodeId: 'topic-1'
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

function expectBrowseTopBarActions() {
  expect(screen.getByRole('button', { name: 'Capture' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'More' })).toBeInTheDocument();
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
    expectBrowseTopBarActions();
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

  it('opens selected topics as immersive reading with tap-revealed chrome', async () => {
    const surface = createReadableSurface();
    await renderShellWithSurface(surface);

    expect(screen.queryByTestId('companion-bottom-tab-bar')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Exit' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByText(/Readable topic body/));

    expect(screen.getByRole('button', { name: 'Exit' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Outline' }));
    expect(screen.getByRole('dialog', { name: 'Outline' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Readable article' }));
    expect(screen.queryByRole('dialog', { name: 'Outline' })).not.toBeInTheDocument();
    expect(screen.getByTestId('companion-article-document')).toHaveAttribute('data-reading-from', '2');
    expect(screen.getByTestId('companion-article-document')).toHaveAttribute('data-reading-to', '18');
    expect(screen.getByText('Readable article')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Font' }));
    expect(screen.getByRole('dialog', { name: 'Font' })).toBeInTheDocument();
    expect(screen.getByText('Reading font controls are not available on Android yet.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Highlight' }));
    expect(screen.getByRole('dialog', { name: 'Highlight' })).toBeInTheDocument();
    expect(screen.getByText('Highlight tools are not available on Android yet.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Info' }));
    expect(screen.getByRole('dialog', { name: 'Info' })).toBeInTheDocument();
    expect(screen.getByText('PDF and text')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(surface.handleTabAction).toHaveBeenCalledWith('search');
  });
});

describe('CompanionShell secondary surfaces', () => {
  it('opens Browse directory and Capture from the top bar', async () => {
    await renderShellWithSurface(createSurface('recent'));

    fireEvent.click(screen.getByRole('button', { name: 'Directory' }));
    expect(screen.queryByRole('heading', { name: 'Directory' })).not.toBeInTheDocument();
    expect(screen.getByText('This folder is empty')).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: 'Browse' })[0]);
    expect(screen.getByRole('button', { name: 'Directory' })).toBeInTheDocument();

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
