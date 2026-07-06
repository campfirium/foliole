import { vi } from 'vitest';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';

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

export function createBreadcrumbSnapshot(): WorkspaceSnapshot {
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
          intervalDurationMs: 0,
          intervalGrowthFactor: 1,
          lastHandledAt: '2026-04-22T08:00:00.000Z',
          nextAt: '2026-04-22T08:00:00.000Z',
          priority: 0,
          readingPosition: 0,
          repetitionCount: 0,
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

export function createItemReviewSurface() {
  const currentCard = {
    content: '# Inner review topic\n\nNested topic body',
    due: '2026-04-22T08:00:00.000Z',
    hideTitleHeading: true,
    itemKind: 'reading' as const,
    nodeId: 'topic-2',
    queuePosition: 1,
    remainingCount: 1,
    reveal: null,
    title: 'Inner review topic',
    totalCount: 1
  };
  const effectiveReviewSession = {
    currentCard,
    nextFsrsDueAt: null,
    nextReadingDueAt: null,
    queueNodeIds: ['topic-2'],
    scheduledFsrsCount: 0,
    scheduledReadingCount: 1,
    totalCount: 1
  };
  return {
    activeAction: 'review',
    browsedFolder: null,
    effectiveReviewSession,
    handleDismissReviewTopic: vi.fn(),
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
    readableArticle: null,
    readingError: null,
    recentArticles: [],
    reviewError: null,
    reviewSession: effectiveReviewSession,
    selectedBrowseNodeId: null
  };
}
