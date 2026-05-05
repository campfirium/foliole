import { render, screen } from '@testing-library/react';
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

type SnapshotNode = WorkspaceSnapshot['nodesById'][string];

function createSnapshotNode(overrides: Partial<SnapshotNode>): SnapshotNode {
  return {
    anchorLink: null,
    content: '',
    createdAt: '2026-04-22T08:00:00.000Z',
    hideTitleHeading: false,
    id: 'node-1',
    isTitleManual: false,
    kind: 'topic',
    parentNodeId: null,
    reading: null,
    reveal: null,
    review: null,
    title: 'Untitled',
    updatedAt: '2026-04-22T09:00:00.000Z',
    ...overrides
  };
}

function createBreadcrumbSnapshot(): WorkspaceSnapshot {
  return {
    activeNodeId: 'topic-1',
    nodeOrder: ['folder-1', 'topic-1', 'topic-2', 'item-1'],
    nodesById: {
      'folder-1': createSnapshotNode({ id: 'folder-1', kind: 'folder', title: 'Inbox' }),
      'topic-1': createSnapshotNode({
        content: '# Imported article title\n\nReadable article body',
        id: 'topic-1',
        kind: 'topic',
        parentNodeId: 'folder-1',
        title: 'Topic node title'
      }),
      'topic-2': createSnapshotNode({
        content: '# Inner review topic\n\nNested topic body',
        id: 'topic-2',
        kind: 'topic',
        parentNodeId: 'topic-1',
        reading: {
          nextAt: '2026-04-22T08:00:00.000Z',
          state: 'active'
        },
        title: 'Inner review topic'
      }),
      'item-1': createSnapshotNode({
        content: 'Prompt body',
        id: 'item-1',
        kind: 'item',
        parentNodeId: 'topic-2',
        reveal: 'Answer',
        review: {
          difficulty: 4.2,
          due: '2026-04-22T08:00:00.000Z',
          elapsedDays: 2,
          lapses: 0,
          lastReviewAt: '2026-04-20T08:00:00.000Z',
          reps: 3,
          scheduledDays: 2,
          stability: 2.1,
          state: 2
        },
        title: 'Item title'
      })
    },
    trashedNodeIds: [],
    untitledSequenceByParent: {}
  };
}

function createItemReviewSurface() {
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
        content: '# Inner review topic\n\nNested topic body',
        due: '2026-04-22T08:00:00.000Z',
        hideTitleHeading: true,
        itemKind: 'reading',
        nodeId: 'topic-2',
        queuePosition: 1,
        remainingCount: 1,
        reveal: null,
        title: 'Inner review topic',
        totalCount: 1
      },
      nextFsrsDueAt: null,
      nextReadingDueAt: null,
      queueNodeIds: ['topic-2'],
      scheduledFsrsCount: 0,
      scheduledReadingCount: 1,
      totalCount: 1
    }
  };
}

describe('CompanionShell review breadcrumb', () => {
  it('stops at the article topic under the folder instead of showing the nested review topic title', async () => {
    useFloatingBarVisibility.mockReturnValue({
      handleContainerScroll: vi.fn(),
      handleTouchEnd: vi.fn(),
      handleTouchMove: vi.fn(),
      handleTouchStart: vi.fn(),
      isVisible: true,
      revealBar: vi.fn()
    });
    useCompanionWorkspaceSync.mockReturnValue({
      error: null,
      readableArticle: null,
      state: {
        endpoint_url: 'http://10.0.2.2:38641',
        last_synced_at: '2026-04-22T09:00:00.000Z',
        workspace_snapshot: createBreadcrumbSnapshot()
      }
    });
    useCompanionArticleSurface.mockReturnValue(createItemReviewSurface());

    const { CompanionShell } = await import('./CompanionShell');
    render(<CompanionShell />);

    expect(screen.getByText('Inbox')).toBeInTheDocument();
    expect(screen.getByText('Topic node title')).toBeInTheDocument();
    expect(screen.queryByText('Inner review topic')).not.toBeInTheDocument();
  });
});
