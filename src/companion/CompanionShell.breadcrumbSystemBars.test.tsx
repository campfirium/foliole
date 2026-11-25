import { act, fireEvent, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../shared/localization/testLocalization';

import { createBreadcrumbSnapshot, createItemReviewSurface } from './CompanionShellBreadcrumbTestSupport';

const host = vi.hoisted(() => ({ apply: vi.fn(async (value: unknown) => { void value; }) }));
const useCompanionWorkspaceSync = vi.fn();
const useCompanionArticleSurface = vi.fn();
const useFloatingBarVisibility = vi.fn();
vi.mock('./useCompanionWorkspaceSync', () => ({ useCompanionWorkspaceSync }));
vi.mock('./useCompanionArticleSurface', () => ({ useCompanionArticleSurface }));
vi.mock('./useFloatingBarVisibility', () => ({ useFloatingBarVisibility }));
vi.mock('@/features/editor/components/MarkdownEditor', () => ({ MarkdownEditor: () => <article>Reading body</article> }));
vi.mock('../shared/platform/companion/reading/companionReadingSystemBars', async () => {
  const { ReadingSystemBarOwner } = await import('../shared/platform/companion/reading/readingSystemBarOwner');
  return { supportsCompanionReadingSystemBars: () => true, companionReadingSystemBars: new ReadingSystemBarOwner(host.apply) };
});

it('keeps the status bar hidden from a Flow child to its parent breadcrumb and back', async () => {
  localStorage.setItem('foliole-companion-reading-display', JSON.stringify({ hideSystemStatusBar: true }));
  useFloatingBarVisibility.mockReturnValue({ handleContainerScroll: vi.fn(), handleTouchEnd: vi.fn(), handleTouchMove: vi.fn(),
    handleTouchStart: vi.fn(), isVisible: true, revealBar: vi.fn() });
  const snapshot = createBreadcrumbSnapshot();
  useCompanionWorkspaceSync.mockReturnValue({
    bootstrapState: { booted_at: '2026-04-22T09:05:00.000Z', database_path: 'foliole-companion-preview.db', database_ready: true,
      device_id: 'android-test-device', runtime_kind: 'android-capacitor' },
    isWorkspaceSyncStateReady: true, syncParticipation: { participating: true }, checkDesktop: vi.fn(), clearError: vi.fn(),
    completePairing: vi.fn(), desktopDiscoveries: [], desktopDiscovery: null, error: null, pairingRequest: null,
    pairingState: { device_id: 'android-test-device', device_kind: 'android-capacitor', device_name: 'Android companion',
      is_paired: true, paired_at: '2026-04-22T09:00:00.000Z' },
    pairingStatus: 'idle', pullFromDesktop: vi.fn(), readableArticle: null, refreshAfterMutation: vi.fn(), saveEndpoint: vi.fn(),
    saveSyncOnboardingStatus: vi.fn(),
    state: { endpoint_url: 'http://10.0.2.2:38641', last_synced_at: '2026-04-22T09:00:00.000Z', remembered_targets: ['http://10.0.2.2:38641'],
      sync_events: [], sync_onboarding_status: 'completed', workspace_snapshot: snapshot },
    status: 'idle'
  });
  const child = createItemReviewSurface();
  useCompanionArticleSurface.mockReturnValue(child);
  const { CompanionShell } = await import('./CompanionShell');
  const shell = () => <CompanionShell bootstrapState={{ booted_at: '2026-04-22T09:05:00.000Z', database_path: 'foliole-companion-preview.db', database_ready: true,
    device_id: 'android-test-device', runtime_kind: 'android-capacitor' }} />;
  const view = renderWithLocalization(shell());
  const wait = (ms: number) => act(async () => { await new Promise(resolve => setTimeout(resolve, ms)); });
  await wait(50);
  // The parent body loads slower than the unmount grace before its reader mounts.
  fireEvent.click(screen.getByRole('button', { name: 'Topic node…' }));
  useCompanionArticleSurface.mockReturnValue({ ...child, activeAction: 'recent', isFlowBrowsing: true, selectedBrowseNodeId: 'topic-1', readableArticle: null });
  view.rerender(shell()); await wait(1700);
  useCompanionArticleSurface.mockReturnValue({ ...child, activeAction: 'recent', isFlowBrowsing: true, selectedBrowseNodeId: 'topic-1',
    readableArticle: { ...child.readableArticle, nodeId: 'topic-1', content: 'Parent body' } });
  view.rerender(shell()); await wait(50);
  expect(screen.getByRole('button', { name: 'Resume review' })).toBeInTheDocument();
  useCompanionArticleSurface.mockReturnValue(child);
  view.rerender(shell()); await wait(1700);
  expect(host.apply.mock.calls.map(([value]) => value)).toEqual([{ enabled: true, hidden: true }]);
});
