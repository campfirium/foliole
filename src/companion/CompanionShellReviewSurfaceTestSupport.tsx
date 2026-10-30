import { vi } from 'vitest';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { renderWithLocalization } from '../shared/localization/testLocalization';
import { createEmptyReviewSession } from '../store/workspaceReviewReading';

import { CompanionReadingActivity } from './companionReadingActivity';

const useCompanionWorkspaceSync = vi.fn();
const useCompanionArticleSurface = vi.fn();
const useFloatingBarVisibility = vi.fn();

vi.mock('./useCompanionWorkspaceSync', () => ({ useCompanionWorkspaceSync }));
vi.mock('./useCompanionArticleSurface', () => ({ useCompanionArticleSurface }));
vi.mock('./useFloatingBarVisibility', () => ({ useFloatingBarVisibility }));
vi.mock('@/features/editor/components/MarkdownEditor', () => ({
  MarkdownEditor: (props: { value: string }) => <div>{props.value}</div>
}));
vi.mock('@/features/pdf/components/SimplePdfDocument', () => ({
  SimplePdfDocument: () => <div>PDF original viewer</div>
}));

function createSnapshot(): WorkspaceSnapshot {
  const topic: WorkspaceSnapshot['nodesById'][string] = {
    anchorLink: null,
    content: 'Readable topic body',
    createdAt: '2026-04-22T08:00:00.000Z',
    currentVersionId: 'base',
    hideTitleHeading: false,
    id: 'topic-1',
    isTitleManual: false,
    kind: 'topic',
    parentNodeId: 'folder-1',
    reading: null,
    reveal: null,
    review: null,
    title: 'Readable article',
    updatedAt: '2026-04-22T09:00:00.000Z'
  };
  return {
    activeNodeId: 'topic-1',
    nodeOrder: ['topic-1'],
    nodesById: {
      'folder-1': { ...topic, id: 'folder-1', kind: 'folder', parentNodeId: null, title: 'Library' },
      'topic-1': topic,
      'item-1': { ...topic, id: 'item-1', kind: 'item', parentNodeId: 'topic-1',
        content: 'Question prompt', title: 'Card one', reveal: 'Answer' }
    },
    trashedNodeIds: [],
    untitledSequenceByParent: {}
  };
}

function mockWorkspaceSync() {
  useCompanionWorkspaceSync.mockReturnValue({
    bootstrapState: {
      booted_at: '2026-04-22T09:05:00.000Z',
      database_path: 'foliole-companion-preview.db',
      database_ready: true,
      device_id: 'android-test-device',
      runtime_kind: 'android-capacitor'
    },
    isWorkspaceSyncStateReady: true,
    syncParticipation: { participating: true },
    checkDesktop: vi.fn(),
    clearError: vi.fn(),
    completePairing: vi.fn(),
    desktopDiscoveries: [],
    desktopDiscovery: null,
    error: null,
    pairingRequest: null,
    pairingState: {
      device_id: 'android-test-device',
      device_kind: 'android-capacitor',
      device_name: 'Android companion',
      is_paired: true,
      paired_at: '2026-04-22T09:00:00.000Z'
    },
    pairingStatus: 'idle',
    pullFromDesktop: vi.fn(),
    readableArticle: null,
    removeRememberedTarget: vi.fn(),
    refreshAfterMutation: vi.fn(),
    saveEndpoint: vi.fn(),
    saveSyncOnboardingStatus: vi.fn(),
    state: {
      endpoint_url: 'http://10.0.2.2:38641',
      last_synced_at: '2026-04-22T09:00:00.000Z',
      remembered_targets: ['http://10.0.2.2:38641'],
      sync_events: [],
      sync_onboarding_status: 'completed',
      workspace_snapshot: createSnapshot()
    },
    status: 'idle'
  });
}

export async function renderShellWithSurface(surface: ReturnType<typeof reviewSurface>, loading = { pending: false }) {
  useFloatingBarVisibility.mockReturnValue({
    handleContainerScroll: vi.fn(),
    handleTouchEnd: vi.fn(),
    handleTouchMove: vi.fn(),
    handleTouchStart: vi.fn(),
    isVisible: true,
    revealBar: vi.fn()
  });
  mockWorkspaceSync();
  useCompanionArticleSurface.mockImplementation(() => {
    const session = surface.reviewSession;
    const card = session.currentCard;
    return { ...surface, effectiveReviewSession: session,
      readableArticle: loading.pending ? null : card ? { content: card.content, nodeId: card.nodeId,
        title: card.title, textAnchorDecorations: [] } : surface.readableArticle };
  });
  const { CompanionShell } = await import('./CompanionShell');
  const shell = () => <CompanionShell
      bootstrapState={{
        booted_at: '2026-04-22T09:05:00.000Z',
        database_path: 'foliole-companion-preview.db',
        database_ready: true,
        device_id: 'android-test-device',
        runtime_kind: 'android-capacitor'
      }}
    />;
  const view = renderWithLocalization(shell());
  return () => view.rerender(shell());
}

export function reviewSurface(currentCard: Record<string, unknown> | null) {
  const reviewSession = {
    currentCard,
    nextFsrsDueAt: currentCard ? null : '2026-04-23T05:55:34.233Z',
    nextReadingDueAt: currentCard ? '2026-04-22T08:00:00.000Z' : '2026-04-23T05:52:15.743Z',
    queueNodeIds: currentCard ? ['topic-1'] : [],
    scheduledFsrsCount: currentCard ? 0 : 9,
    scheduledReadingCount: currentCard ? 1 : 2,
    totalCount: currentCard ? 1 : 0
  };
  return {
    flowSummary: { ...createEmptyReviewSession(), queueCleared: !currentCard },
    activeAction: 'review',
    flowHasTopics: true,
    canContinueReading: true,
    handleContinueReading: vi.fn(),
    browsedFolder: null,
    handleReadReviewTopic: vi.fn(),
    handlePostponeReviewTopic: vi.fn(),
    handleDismissReviewTopic: vi.fn(),
    handleGradeReview: vi.fn(),
    handleSelectBrowseNode: vi.fn(),
    handleRevealAnswer: vi.fn(),
    handleSelectRecentArticle: vi.fn(),
    handleTabAction: vi.fn(),
    isAnswerRevealed: true,
    isSubmittingGrade: false,
    isSubmittingReadingAction: false,
    readingActivity: new CompanionReadingActivity(currentCard?.nodeId as string ?? null, vi.fn()),
    handleSoonReviewTopic: vi.fn(),
    readableArticle: currentCard ? { content: currentCard.content, nodeId: currentCard.nodeId, title: currentCard.title, textAnchorDecorations: [] } : { content: '# Readable article', nodeId: 'topic-1', title: 'Readable article', textAnchorDecorations: [] },
    recentArticles: [],
    readingError: null as string | null,
    reviewError: null as string | null,
    flowError: null as string | null,
    effectiveReviewSession: reviewSession,
    reviewSession,
    selectedBrowseNodeId: null
  };
}

export const readingReviewCard = {
  content: 'Readable topic body',
  due: '2026-04-22T08:00:00.000Z',
  itemKind: 'reading',
  nodeId: 'topic-1',
  queuePosition: 1,
  remainingCount: 1,
  reveal: null,
  title: 'Readable article',
  totalCount: 1
};

export const fsrsReviewCard = {
  content: 'Question prompt',
  due: '2026-04-22T08:00:00.000Z',
  itemKind: 'fsrs',
  nodeId: 'item-1',
  queuePosition: 1,
  remainingCount: 1,
  reveal: 'Answer',
  hasAnswer: true,
  title: 'Card one',
  totalCount: 1
};
