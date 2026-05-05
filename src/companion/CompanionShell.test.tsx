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

function mockWorkspaceSync(args: {
  isPaired?: boolean;
  snapshot?: WorkspaceSnapshot | null;
  syncOnboardingStatus?: 'accepted' | 'completed' | 'dismissed' | 'pending';
} = {}) {
  const snapshot = args.snapshot === undefined ? createSnapshot() : args.snapshot;
  useCompanionWorkspaceSync.mockReturnValue({
    bootstrapState: {
      booted_at: '2026-04-22T09:05:00.000Z',
      database_path: 'foliole-companion-preview.db',
      database_ready: true,
      device_id: 'android-test-device',
      runtime_kind: 'android-capacitor'
    },
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
      is_paired: args.isPaired ?? true,
      paired_at: args.isPaired === false ? null : '2026-04-22T09:00:00.000Z'
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
      sync_onboarding_status: args.syncOnboardingStatus ?? 'completed',
      workspace_snapshot: snapshot
    },
    status: 'idle'
  });
}

async function renderShellWithSurface(surface: MockSurface) {
  const floatingBar = mockFloatingBar();
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
  return { floatingBar };
}


function createReviewEmptySurface() {
  return {
    activeAction: 'review',
    browsedFolder: null,
    handleGradeReview: vi.fn(),
    handleCompleteReviewItem: vi.fn(),
    handleDeferReviewItem: vi.fn(),
    handleDismissReviewItem: vi.fn(),
    handleSelectBrowseNode: vi.fn(),
    handleRevealAnswer: vi.fn(),
    handleSelectRecentArticle: vi.fn(),
    handleTabAction: vi.fn(),
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
    },
    selectedBrowseNodeId: null
  };
}

function createReadingReviewSurface() {
  return {
    activeAction: 'review',
    browsedFolder: null,
    handleCompleteReviewItem: vi.fn(),
    handleDeferReviewItem: vi.fn(),
    handleDismissReviewItem: vi.fn(),
    handleGradeReview: vi.fn(),
    handleSelectBrowseNode: vi.fn(),
    handleRevealAnswer: vi.fn(),
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
    },
    selectedBrowseNodeId: null
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

  it('opens settings from the more action before entering sync details', async () => {
    await renderShellWithSurface({
      ...createReviewEmptySurface(),
      activeAction: 'more'
    });

    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Connect another device/ })).toBeInTheDocument();
    expect(screen.queryByText('Connected')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Connect another device/ }));

    expect(screen.getByRole('heading', { level: 1, name: 'Device sync' })).toBeInTheDocument();
    expect(screen.getByText('Last sync')).toBeInTheDocument();
    expect(screen.getByText('Sync log')).toBeInTheDocument();
    expect(screen.getByText('Android companion (Android)')).toBeInTheDocument();
    expect(screen.getByText('No sync records yet.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sync now' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Settings' })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'More' })).toHaveAttribute('aria-current', 'page');
  });
});
