import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

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

vi.mock('@/features/pdf/components/SimplePdfDocument', () => ({
  SimplePdfDocument: () => <div>PDF original viewer</div>
}));

afterEach(() => {
  window.localStorage.clear();
});

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

describe('CompanionShell review surfaces', () => {
  it('opens settings from the settings action before entering sync details', async () => {
    await renderShellWithSurface({
      ...createReviewEmptySurface(),
      activeAction: 'more'
    });

    expect(screen.queryByRole('heading', { name: 'Settings' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Connect another device/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Device information/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Storage/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Display preferences/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Diagnostics/ })).toBeInTheDocument();
    expect(screen.queryByText('Connected')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Connect another device/ }));

    expect(screen.getByRole('heading', { level: 1, name: 'Device sync' })).toBeInTheDocument();
    expect(screen.getByText('Last sync')).toBeInTheDocument();
    expect(screen.getByText('Activity')).toBeInTheDocument();
    expect(screen.getByText('Connection')).toBeInTheDocument();
    expect(screen.getByText('No activity')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sync now' })).not.toBeInTheDocument();
    const settingsButtons = screen.getAllByRole('button', { name: 'Settings' });
    expect(settingsButtons).toHaveLength(2);
    expect(settingsButtons.some((button) => button.getAttribute('aria-current') === 'page')).toBe(true);
  });

  it('opens Tabs settings and enables the fifth shortcut tab', async () => {
    const surface = { ...createReviewEmptySurface(), activeAction: 'more' };
    await renderShellWithSurface(surface);

    fireEvent.click(screen.getByRole('button', { name: /Choose bottom tabs/ }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Shortcut tab target' }), { target: { value: 'directory' } });

    expect(screen.getByRole('button', { name: 'Directory' })).toBeInTheDocument();
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: vi.fn(() => screen.getByTestId('tab-slot-browse')) });
    fireEvent.pointerDown(screen.getByTestId('tab-slot-shortcut-handle'), { clientX: 20, clientY: 120, pointerId: 1 });
    fireEvent.pointerUp(screen.getByTestId('tab-slot-shortcut-handle'), { clientX: 20, clientY: 20, pointerId: 1 });
    fireEvent.click(screen.getByRole('button', { name: 'Directory' }));
    expect(surface.handleTabAction).toHaveBeenCalledWith('recent');
    expect(JSON.parse(window.localStorage.getItem('foliole-companion-tabs-config') ?? '{}').orderedTabIds[0]).toBe('shortcut');
  });

});
