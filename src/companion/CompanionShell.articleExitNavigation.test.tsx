import { fireEvent, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { CompanionReadingActivity } from './companionReadingActivity';

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
    syncParticipation: { participating: true },
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

function touchArticle(type: string, body: HTMLElement, x = 10, y = 10) {
  const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y });
  Object.defineProperties(event, {
    pointerId: { value: 1 }, pointerType: { value: 'touch' }, isPrimary: { value: true }
  });
  fireEvent(body, event);
}

describe('CompanionShell article touch controls', () => {
  it('reveals reading controls after a short touch without a compatibility click', async () => {
    await renderShellWithSurface(createReadableSurface());
    const body = screen.getByTestId('companion-article-document');
    touchArticle('pointerdown', body);
    touchArticle('pointerup', body);
    expect(screen.getByRole('button', { name: 'Outline' })).toBeInTheDocument();
  });

  it('toggles reading controls once when a short touch also emits a compatibility click', async () => {
    await renderShellWithSurface(createReadableSurface());
    const body = screen.getByTestId('companion-article-document');
    touchArticle('pointerdown', body);
    touchArticle('pointerup', body);
    fireEvent.click(body, { detail: 1 });
    expect(screen.getByRole('button', { name: 'Outline' })).toBeInTheDocument();
    touchArticle('pointerdown', body);
    touchArticle('pointerup', body);
    fireEvent.click(body, { detail: 1 });
    expect(screen.queryByRole('button', { name: 'Outline' })).not.toBeInTheDocument();
  });

  it.each(['pointermove', 'pointercancel'])('keeps controls hidden after a touch %s', async (eventType) => {
    await renderShellWithSurface(createReadableSurface());
    const body = screen.getByTestId('companion-article-document');
    touchArticle('pointerdown', body);
    touchArticle(eventType, body, 10, 30);
    touchArticle('pointerup', body, 10, 30);
    expect(screen.queryByRole('button', { name: 'Outline' })).not.toBeInTheDocument();
  });

  it('keeps controls hidden after a long touch used for text selection', async () => {
    await renderShellWithSurface(createReadableSurface());
    const body = screen.getByTestId('companion-article-document');
    const now = vi.spyOn(Date, 'now').mockReturnValue(1000);
    try {
      touchArticle('pointerdown', body);
      now.mockReturnValue(1600);
      touchArticle('pointerup', body);
    } finally { now.mockRestore(); }
    expect(screen.queryByRole('button', { name: 'Outline' })).not.toBeInTheDocument();
  });

  it('still accepts a mouse click after a touch that emitted no compatibility click', async () => {
    await renderShellWithSurface(createReadableSurface());
    const body = screen.getByTestId('companion-article-document');
    touchArticle('pointerdown', body);
    touchArticle('pointerup', body);
    fireEvent.pointerDown(body);
    fireEvent.click(body, { detail: 1 });
    expect(screen.queryByRole('button', { name: 'Outline' })).not.toBeInTheDocument();
  });

});

describe('CompanionShell article exit navigation', () => {
  it('exposes only the revealed reading controls while a review article covers the shell', async () => {
    const surface = {
      ...createReadableSurface(),
      activeAction: 'review',
      readingActivity: new CompanionReadingActivity('topic-1', vi.fn()),
      effectiveReviewSession: { currentCard: { nodeId: 'topic-1', itemKind: 'reading' } }
    };
    await renderShellWithSurface(surface);

    expect(screen.queryByRole('button', { name: 'Exit' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('companion-article-document'));
    expect(screen.getAllByRole('button', { name: 'Exit' })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Exit' }));
    expect(surface.handleTabAction).toHaveBeenCalledWith('recent');
  });

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
