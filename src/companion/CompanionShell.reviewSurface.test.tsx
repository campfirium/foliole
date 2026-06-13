import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { renderWithLocalization } from '../shared/localization/testLocalization';

const useCompanionWorkspaceSync = vi.fn();
const useCompanionArticleSurface = vi.fn();
const useFloatingBarVisibility = vi.fn();

vi.mock('./useCompanionWorkspaceSync', () => ({ useCompanionWorkspaceSync }));
vi.mock('./useCompanionArticleSurface', () => ({ useCompanionArticleSurface }));
vi.mock('./useFloatingBarVisibility', () => ({ useFloatingBarVisibility }));
vi.mock('./CompanionReviewCard', () => ({
  CompanionReviewAnswer: () => <div data-testid="companion-review-answer" />,
  CompanionReviewCard: (props: { breadcrumbItems?: Array<{ label: string }> }) => (
    <div data-testid="companion-review-card">
      {(props.breadcrumbItems ?? []).map((item) => <span key={item.label}>{item.label}</span>)}
    </div>
  )
}));
vi.mock('@/features/pdf/components/SimplePdfDocument', () => ({
  SimplePdfDocument: () => <div>PDF original viewer</div>
}));

afterEach(() => {
  window.localStorage.clear();
});

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
    replaceSnapshot: vi.fn(),
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

async function renderShellWithSurface(surface: Record<string, unknown>) {
  useFloatingBarVisibility.mockReturnValue({
    handleContainerScroll: vi.fn(),
    handleTouchEnd: vi.fn(),
    handleTouchMove: vi.fn(),
    handleTouchStart: vi.fn(),
    isVisible: true,
    revealBar: vi.fn()
  });
  mockWorkspaceSync();
  useCompanionArticleSurface.mockReturnValue(surface);
  const { CompanionShell } = await import('./CompanionShell');
  renderWithLocalization(
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

function reviewSurface(currentCard: Record<string, unknown> | null) {
  return {
    activeAction: 'review',
    browsedFolder: null,
    handleReadReviewTopic: vi.fn(),
    handlePostponeReviewTopic: vi.fn(),
    handleDismissReviewTopic: vi.fn(),
    handleGradeReview: vi.fn(),
    handleSelectBrowseNode: vi.fn(),
    handleRevealAnswer: vi.fn(),
    handleSelectRecentArticle: vi.fn(),
    handleTabAction: vi.fn(),
    isAnswerRevealed: false,
    isSubmittingGrade: false,
    isSubmittingReadingAction: false,
    readableArticle: currentCard ? null : { content: '# Readable article', nodeId: 'topic-1', title: 'Readable article' },
    recentArticles: [],
    readingError: null,
    reviewError: null,
    reviewSession: {
      currentCard,
      nextFsrsDueAt: currentCard ? null : '2026-04-23T05:55:34.233Z',
      nextReadingDueAt: currentCard ? '2026-04-22T08:00:00.000Z' : '2026-04-23T05:52:15.743Z',
      queueNodeIds: currentCard ? ['topic-1'] : [],
      scheduledFsrsCount: currentCard ? 0 : 9,
      scheduledReadingCount: currentCard ? 1 : 2,
      totalCount: currentCard ? 1 : 0
    },
    selectedBrowseNodeId: null
  };
}

describe('CompanionShell review surfaces', () => {
  it('shows the review empty state instead of falling back to reading content', async () => {
    await renderShellWithSurface(reviewSurface(null));

    expect(screen.getByText('No items are due right now')).toBeInTheDocument();
    expect(screen.getByText(/Synced review state: 2 reading topics, 9 items\./)).toBeInTheDocument();
    expect(screen.queryByText('Readable article')).not.toBeInTheDocument();
  });

  it('shows reading actions when the current review card is a reading item', async () => {
    await renderShellWithSurface(reviewSurface({
      content: 'Readable topic body',
      due: '2026-04-22T08:00:00.000Z',
      itemKind: 'reading',
      nodeId: 'topic-1',
      queuePosition: 1,
      remainingCount: 1,
      reveal: null,
      title: 'Readable article',
      totalCount: 1
    }));

    expect(screen.getByLabelText('Later')).toBeInTheDocument();
    expect(screen.getByLabelText('Read')).toBeInTheDocument();
    expect(screen.getByLabelText('Dismiss')).toBeInTheDocument();
    expect(screen.queryByLabelText('Again')).not.toBeInTheDocument();
  });

  it('reserves review footer space separately from the normal bottom tabs', async () => {
    await renderShellWithSurface(reviewSurface({
      content: 'Readable topic body',
      due: '2026-04-22T08:00:00.000Z',
      itemKind: 'reading',
      nodeId: 'topic-1',
      queuePosition: 1,
      remainingCount: 1,
      reveal: null,
      title: 'Readable article',
      totalCount: 1
    }));

    const content = screen.getByTestId('companion-scroll-container').firstElementChild;
    expect(content?.className).toContain('[padding-bottom:7rem]');
    expect(content?.className).not.toContain('[padding-bottom:4.5rem]');
  });
});
