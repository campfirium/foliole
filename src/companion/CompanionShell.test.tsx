import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';

const useCompanionWorkspaceSync = vi.fn();
const useCompanionArticleSurface = vi.fn();
const useFloatingBarVisibility = vi.fn();

vi.mock('./useCompanionWorkspaceSync', () => ({
  useCompanionWorkspaceSync
}));

vi.mock('./useCompanionArticleSurface', () => ({
  useCompanionArticleSurface
}));

vi.mock('./useFloatingBarVisibility', () => ({
  useFloatingBarVisibility
}));

vi.mock('./CompanionReviewCard', () => ({
  CompanionReviewAnswer: () => <div data-testid="companion-review-answer" />,
  CompanionReviewCard: (props: { breadcrumbItems?: Array<{ label: string }> }) => (
    <div data-testid="companion-review-card">
      {(props.breadcrumbItems ?? []).map((item) => (
        <span key={item.label}>{item.label}</span>
      ))}
    </div>
  )
}));

type MockSurface = Record<string, unknown>;

function createSnapshot(): WorkspaceSnapshot {
  return {
    activeNodeId: 'topic-1',
    nodeOrder: ['topic-1'],
    nodesById: {
      'topic-1': {
        anchorLink: null,
        content: '# Readable article',
        createdAt: '2026-04-22T08:00:00.000Z',
        hideTitleHeading: false,
        id: 'topic-1',
        isTitleManual: false,
        kind: 'topic',
        parentNodeId: null,
        reading: null,
        reveal: null,
        review: null,
        title: 'Readable article',
        updatedAt: '2026-04-22T09:00:00.000Z'
      }
    },
    trashedNodeIds: [],
    untitledSequenceByParent: {}
  };
}

function mockFloatingBar() {
  const revealBar = vi.fn();
  useFloatingBarVisibility.mockReturnValue({
    handleContainerScroll: vi.fn(),
    handleTouchEnd: vi.fn(),
    handleTouchMove: vi.fn(),
    handleTouchStart: vi.fn(),
    isVisible: true,
    revealBar
  });
  return { revealBar };
}

function mockWorkspaceSync(snapshot = createSnapshot()) {
  useCompanionWorkspaceSync.mockReturnValue({
    error: null,
    state: {
      endpoint_url: 'http://10.0.2.2:38641',
      last_synced_at: '2026-04-22T09:00:00.000Z',
      workspace_snapshot: snapshot
    }
  });
}

async function renderShellWithSurface(surface: MockSurface) {
  const floatingBar = mockFloatingBar();
  mockWorkspaceSync();
  useCompanionArticleSurface.mockReturnValue(surface);
  const { CompanionShell } = await import('./CompanionShell');
  render(<CompanionShell />);
  return { floatingBar };
}

function createReviewEmptySurface() {
  return {
    activeAction: 'review',
    handleGradeReview: vi.fn(),
    handleCompleteReviewItem: vi.fn(),
    handleDeferReviewItem: vi.fn(),
    handleDismissReviewItem: vi.fn(),
    handleRevealAnswer: vi.fn(),
    handleSelectRecentArticle: vi.fn(),
    handleTopBarAction: vi.fn(),
    isAnswerRevealed: false,
    isSubmittingGrade: false,
    isSubmittingReadingAction: false,
    readableArticle: {
      content: '# Readable article',
      nodeId: 'topic-1',
      title: 'Readable article'
    },
    recentArticles: [],
    readingError: null,
    reviewError: null,
    reviewSession: {
      currentCard: null,
      nextFsrsDueAt: '2026-04-23T05:55:34.233Z',
      nextReadingDueAt: '2026-04-23T05:52:15.743Z',
      queueNodeIds: [],
      scheduledFsrsCount: 9,
      scheduledReadingCount: 2,
      totalCount: 0
    }
  };
}

function createReadingReviewSurface() {
  return {
    activeAction: 'review',
    handleCompleteReviewItem: vi.fn(),
    handleDeferReviewItem: vi.fn(),
    handleDismissReviewItem: vi.fn(),
    handleGradeReview: vi.fn(),
    handleRevealAnswer: vi.fn(),
    handleSelectRecentArticle: vi.fn(),
    handleTopBarAction: vi.fn(),
    isAnswerRevealed: false,
    isSubmittingGrade: false,
    isSubmittingReadingAction: false,
    readableArticle: null,
    recentArticles: [],
    readingError: null,
    reviewError: null,
    reviewSession: {
      currentCard: {
        content: 'Readable topic body',
        due: '2026-04-22T08:00:00.000Z',
        itemKind: 'reading',
        nodeId: 'topic-1',
        queuePosition: 1,
        remainingCount: 1,
        reveal: null,
        title: 'Readable article',
        totalCount: 1
      },
      nextFsrsDueAt: null,
      nextReadingDueAt: '2026-04-22T08:00:00.000Z',
      queueNodeIds: ['topic-1'],
      scheduledFsrsCount: 0,
      scheduledReadingCount: 1,
      totalCount: 1
    }
  };
}

describe('CompanionShell review surfaces', () => {
  it('shows the review empty state instead of falling back to reading content', async () => {
    await renderShellWithSurface(createReviewEmptySurface());

    expect(screen.getByText('No review items are due right now.')).toBeInTheDocument();
    expect(screen.getByText(/Synced review state: 2 reading topics, 9 FSRS cards\./)).toBeInTheDocument();
    expect(screen.queryByText('Readable article')).not.toBeInTheDocument();
  });

  it('shows reading actions when the current review card is a reading item', async () => {
    await renderShellWithSurface(createReadingReviewSurface());

    expect(screen.getByLabelText('Later')).toBeInTheDocument();
    expect(screen.getByLabelText('Read')).toBeInTheDocument();
    expect(screen.getByLabelText('Dismiss')).toBeInTheDocument();
    expect(screen.queryByLabelText('Again')).not.toBeInTheDocument();
  });

  it('hides the top toolbar by default during immersive review and reveals it on tap', async () => {
    const { floatingBar } = await renderShellWithSurface(createReadingReviewSurface());

    expect(screen.getByTestId('companion-top-floating-bar').className).toContain('opacity-0');

    fireEvent.click(screen.getByTestId('companion-scroll-container'));

    expect(floatingBar.revealBar).toHaveBeenCalled();
  });
});
