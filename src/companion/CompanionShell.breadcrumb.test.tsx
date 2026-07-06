import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { renderWithLocalization } from '../shared/localization/testLocalization';

import { createBreadcrumbSnapshot, createItemReviewSurface } from './CompanionShellBreadcrumbTestSupport';

const useCompanionWorkspaceSync = vi.fn();
const useCompanionArticleSurface = vi.fn();
const useFloatingBarVisibility = vi.fn();
const RELEASE_GATE_TEST_TIMEOUT_MS = 15_000;

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
  CompanionReviewCard: (props: { breadcrumbItems?: Array<{ label: string; targetNodeId: string }>; onSelectBreadcrumbItem?: (id: string) => void }) => (
    <div data-testid="companion-review-card">
      {(props.breadcrumbItems ?? []).map((item) => (
        <button key={item.label} onClick={() => props.onSelectBreadcrumbItem?.(item.targetNodeId)} type="button">
          {item.label}
        </button>
      ))}
    </div>
  )
}));

function mockBreadcrumbEnvironment(snapshot: WorkspaceSnapshot) {
  useFloatingBarVisibility.mockReturnValue({
    handleContainerScroll: vi.fn(),
    handleTouchEnd: vi.fn(),
    handleTouchMove: vi.fn(),
    handleTouchStart: vi.fn(),
    isVisible: true,
    revealBar: vi.fn()
  });
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
    replaceSnapshot: vi.fn(),
    saveEndpoint: vi.fn(),
    saveSyncOnboardingStatus: vi.fn(),
    state: {
      endpoint_url: 'http://10.0.2.2:38641',
      last_synced_at: '2026-04-22T09:00:00.000Z',
      remembered_targets: ['http://10.0.2.2:38641'],
      sync_events: [],
      sync_onboarding_status: 'completed',
      workspace_snapshot: snapshot
    },
    status: 'idle'
  });
}

async function renderBreadcrumbShell(surface = createItemReviewSurface()) {
  mockBreadcrumbEnvironment(createBreadcrumbSnapshot());
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

  return { surface };
}

describe('CompanionShell review breadcrumb', () => {
  it('stops at the article topic under the folder instead of showing the nested review topic title', async () => {
    await renderBreadcrumbShell();

    expect(screen.getByText('Inbox')).toBeInTheDocument();
    expect(screen.getByText('Topic node title')).toBeInTheDocument();
    expect(screen.queryByText('Inner review topic')).not.toBeInTheDocument();
  }, RELEASE_GATE_TEST_TIMEOUT_MS);

  it('routes folder breadcrumbs to the folder browse surface target', async () => {
    const { surface } = await renderBreadcrumbShell();

    fireEvent.click(screen.getByRole('button', { name: 'Inbox' }));

    expect(surface.handleSelectBrowseNode).toHaveBeenCalledWith('folder-1');
  });

  it('routes nested breadcrumb labels back to the nested review topic target', async () => {
    const surface = createItemReviewSurface();
    surface.effectiveReviewSession.currentCard = {
      ...surface.effectiveReviewSession.currentCard,
      nodeId: 'item-1'
    };
    await renderBreadcrumbShell(surface);

    fireEvent.click(screen.getByRole('button', { name: 'Inner review topic' }));

    expect(surface.handleSelectBrowseNode).toHaveBeenCalledWith('topic-2');
  });
});
