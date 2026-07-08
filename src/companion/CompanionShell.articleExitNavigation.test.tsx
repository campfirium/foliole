import { fireEvent, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { describe, expect, it, vi } from 'vitest';

const useCompanionWorkspaceSync = vi.fn();
const useCompanionArticleSurface = vi.fn();
const useFloatingBarVisibility = vi.fn();

vi.mock('./useCompanionWorkspaceSync', () => ({ useCompanionWorkspaceSync }));
vi.mock('./useCompanionArticleSurface', () => ({ useCompanionArticleSurface }));
vi.mock('./useFloatingBarVisibility', () => ({ useFloatingBarVisibility }));

vi.mock('./CompanionArticleDocument', () => ({
  CompanionArticleDocument: (props: { content: string; onEditorReady?: (adapter: unknown) => void }) => {
    useEffect(() => {
      props.onEditorReady?.({ revealSelectionCentered: vi.fn(), setSearchDecorations: vi.fn() });
      return () => props.onEditorReady?.(null);
    }, [props]);
    return <article data-testid="companion-article-document">{props.content}</article>;
  }
}));

const BOOTSTRAP_STATE = {
  booted_at: '2026-04-22T09:05:00.000Z',
  database_path: 'foliole-companion-preview.db',
  database_ready: true,
  device_id: 'android-test-device',
  runtime_kind: 'android-capacitor' as const
};

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

function createSurface(overrides?: Record<string, unknown>) {
  const reviewSession = {
    currentCard: null,
    nextFsrsDueAt: null,
    nextReadingDueAt: null,
    scheduledFsrsCount: 0,
    scheduledReadingCount: 0
  };
  return {
    activeAction: 'recent',
    browsedFolder: null,
    effectiveReviewSession: reviewSession,
    handleDismissReviewTopic: vi.fn(),
    handleExitBrowseArticle: vi.fn(),
    handleExitDirectoryArticle: vi.fn(),
    handleExitSearchArticle: vi.fn(),
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
    onlyReviewSession: reviewSession,
    readableArticle: null,
    readingError: null,
    recentArticles: [],
    reviewError: null,
    reviewSession,
    selectedBrowseNodeId: null,
    ...overrides
  };
}

function createReadableSurface() {
  return createSurface({
    readableArticle: {
      content: '# Readable article\n\nReadable topic body',
      hideTitleHeading: false,
      nodeId: 'topic-1',
      persistedNodeViewState: null,
      textAnchorDecorations: [],
      title: 'Readable article'
    },
    selectedBrowseNodeId: 'topic-1'
  });
}

async function renderShellWithSurface(surface: unknown) {
  mockFloatingBar();
  mockWorkspaceSync();
  useCompanionArticleSurface.mockReturnValue(surface);
  const { CompanionShell } = await import('./CompanionShell');
  return {
    CompanionShell,
    rendered: render(<CompanionShell bootstrapState={BOOTSTRAP_STATE} />)
  };
}

describe('CompanionShell article exit navigation', () => {
  it('restores bottom navigation after readable article exit clears detail state', async () => {
    const surface = createReadableSurface();
    const { CompanionShell, rendered } = await renderShellWithSurface(surface);

    expect(screen.queryByTestId('companion-bottom-tab-bar')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('companion-article-document'));
    fireEvent.click(screen.getByRole('button', { name: 'Exit' }));
    expect(surface.handleExitBrowseArticle).toHaveBeenCalledTimes(1);

    useCompanionArticleSurface.mockReturnValue(createSurface());
    rendered.rerender(<CompanionShell bootstrapState={BOOTSTRAP_STATE} />);

    expect(screen.getByTestId('companion-bottom-tab-bar')).toBeInTheDocument();
  });
});
