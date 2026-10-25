import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../shared/localization/testLocalization';

import { CompanionReadingActivity } from './companionReadingActivity';

const useCompanionWorkspaceSync = vi.fn();
const useCompanionArticleSurface = vi.fn();
const useFloatingBarVisibility = vi.fn();
const RELEASE_GATE_TEST_TIMEOUT_MS = 15_000;

vi.mock('./useCompanionWorkspaceSync', () => ({ useCompanionWorkspaceSync }));
vi.mock('./useCompanionArticleSurface', () => ({ useCompanionArticleSurface }));
vi.mock('./useFloatingBarVisibility', () => ({ useFloatingBarVisibility }));
vi.mock('@/features/editor/components/MarkdownEditor', () => ({
  MarkdownEditor: () => <article>Browsing another article</article>
}));

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

function mockBrowseSurface() {
  const reviewSession = {
    currentCard: null,
    nextFsrsDueAt: null,
    nextReadingDueAt: null,
    scheduledFsrsCount: 0,
    scheduledReadingCount: 0
  };
  const surface = {
    activeAction: 'recent',
    isFlowBrowsing: false,
    readingActivity: new CompanionReadingActivity('topic-1', vi.fn()),
    handleResumeFlow: vi.fn(),
    browsedFolder: null,
    handleReadReviewTopic: vi.fn(),
    handlePostponeReviewTopic: vi.fn(),
    handleDismissReviewTopic: vi.fn(),
    handleGradeReview: vi.fn(),
    handleRevealAnswer: vi.fn(),
    handleSelectBrowseNode: vi.fn(),
    handleSelectRecentArticle: vi.fn(),
    handleTabAction: vi.fn(),
    effectiveReviewSession: reviewSession,
    isAnswerRevealed: false,
    isSubmittingGrade: false,
    isSubmittingReadingAction: false,
    readableArticle: null,
    recentArticles: [],
    readingError: null,
    reviewError: null,
    reviewSession: {
      currentCard: null,
      nextFsrsDueAt: null,
      nextReadingDueAt: null,
      scheduledFsrsCount: 0,
      scheduledReadingCount: 0
    },
    selectedBrowseNodeId: null
  };
  useCompanionArticleSurface.mockReturnValue(surface);
  return surface;
}

describe('CompanionShell navigation visibility', () => {
  it('keeps bottom navigation visible when Browse content scrolls down', { meta: { calibratedMs: RELEASE_GATE_TEST_TIMEOUT_MS } }, async () => {
    useFloatingBarVisibility.mockReturnValue({
      handleContainerScroll: vi.fn(),
      handleTouchEnd: vi.fn(),
      handleTouchMove: vi.fn(),
      handleTouchStart: vi.fn(),
      isVisible: false,
      revealBar: vi.fn()
    });
    mockWorkspaceSync();
    mockBrowseSurface();
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

    expect(screen.getByTestId('companion-bottom-tab-bar')).toBeInTheDocument();
  });
});

it.each(['folder', 'article'])('keeps %s browsing in Flow with Resume and only a top exit', async kind => {
  mockWorkspaceSync();
  const surface = mockBrowseSurface();
  useCompanionArticleSurface.mockReturnValue({ ...surface, activeAction: 'review', isFlowBrowsing: true,
    selectedBrowseNodeId: kind === 'folder' ? 'folder' : 'topic-1',
    browsedFolder: kind === 'folder' ? { nodeId: 'folder', title: 'Folder', items: [] } : null,
    readableArticle: kind === 'article' ? { nodeId: 'topic-1', content: 'Browsing another article', title: 'Article', textAnchorDecorations: [] } : null });
  const { CompanionShell } = await import('./CompanionShell');
  renderWithLocalization(<CompanionShell bootstrapState={{ booted_at: '2026-10-25T00:00:00Z',
    database_path: 'preview.db', database_ready: true, device_id: 'test', runtime_kind: 'android-capacitor' }} />);
  expect(await screen.findByText(kind === 'folder' ? 'Folder' : 'Browsing another article')).toBeVisible();
  expect(screen.queryByTestId('companion-bottom-tab-bar')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Resume review' }));
  expect(surface.handleResumeFlow).toHaveBeenCalledOnce();
  expect(within(screen.getByRole('group', { name: 'Companion review toolbar' })).queryByRole('button', { name: 'Exit' })).not.toBeInTheDocument();
  if (kind === 'article') fireEvent.click(screen.getByText('Browsing another article'));
  fireEvent.click(await screen.findByRole('button', { name: 'Exit' }));
  expect(surface.handleTabAction).toHaveBeenCalledWith('recent');
});
