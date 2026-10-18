import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { expect, it, vi } from 'vitest';

import type { NativeCompanionWorkspaceSyncState } from '../../lib/platform/nativeCompanionSyncContract';
import { MouseGestureSettingsProvider } from '../features/settings/context/MouseGestureSettingsProvider';
import { publishCompanionSyncApplied } from '../shared/platform/companion/sync/companionSyncApplied';

import { deferred } from './companionContentEditingTestSupport';
import { CompanionDraftProvider } from './CompanionDraftProvider';
import { CompanionShellReadableArticle } from './CompanionShellReadableArticle';
import { useCompanionArticleSurface } from './useCompanionArticleSurface';
import { createCompanionArticleSnapshot, createFloatingBar, createWorkspaceSync } from './useCompanionArticleSurfaceTestSupport';
import { useCompanionSyncAppliedRefresh } from './useCompanionSyncAppliedRefresh';

const refresh = vi.hoisted(() => vi.fn());
vi.mock('../shared/platform/companion/companionWorkspaceRepository', () => ({
  refreshCompanionWorkspaceAfterSync: refresh
}));
vi.mock('../shared/platform/companionSyncObjects', () => ({
  loadCompanionSyncNodeConflicts: async () => [],
  saveCompanionSyncActiveViewState: vi.fn(),
  saveCompanionSyncNodeReadingRecord: vi.fn(),
  saveCompanionSyncNodeReviewRecord: vi.fn(),
  saveCompanionSyncNodeViewState: vi.fn(async () => undefined)
}));

function Reader() {
  const [state, setState] = useState<NativeCompanionWorkspaceSyncState>(() => createWorkspaceSync().state);
  const [, setConflicts] = useState(0);
  const [, setError] = useState<string | null>(null);
  useCompanionSyncAppliedRefresh(setState, setConflicts, setError);
  const workspaceSync = { ...createWorkspaceSync(state.workspace_snapshot), state, readableArticle: null };
  const surface = useCompanionArticleSurface(workspaceSync, createFloatingBar());
  return <MouseGestureSettingsProvider><CompanionDraftProvider>
    <button onClick={() => surface.handleSelectRecentArticle('article-1')}>Open topic</button>
    <CompanionShellReadableArticle surface={surface} workspaceSync={workspaceSync} onExit={() => {}} />
  </CompanionDraftProvider></MouseGestureSettingsProvider>;
}

function tapBody() {
  const body = screen.getByText('Body');
  for (const type of ['pointerdown', 'pointerup']) {
    const event = new MouseEvent(type, { bubbles: true });
    Object.defineProperties(event, {
      pointerId: { value: 1 }, pointerType: { value: 'touch' }, isPrimary: { value: true }
    });
    fireEvent(body, event);
  }
  fireEvent.click(body, { detail: 1 });
}

it.each(['before refresh', 'during refresh'])(
  'preserves the mounted reader, expanded controls and scroll when tapped %s', async (timing) => {
    const gate = deferred<ReturnType<typeof createCompanionArticleSnapshot>>();
    refresh.mockReturnValueOnce(gate.promise);
    const view = render(<Reader />);
    fireEvent.click(screen.getByText('Open topic'));
    const surface = view.container.querySelector('section');
    expect(surface).not.toBeNull();
    if (!surface) throw new Error('Reader did not open');
    surface.scrollTop = 180;
    fireEvent.scroll(surface);
    if (timing === 'before refresh') tapBody();
    await act(async () => publishCompanionSyncApplied());
    if (timing === 'during refresh') tapBody();
    expect(screen.getByRole('button', { name: 'Outline' })).toBeVisible();
    const snapshot = createCompanionArticleSnapshot();
    snapshot.nodesById['article-1']!.content = '# First article\n\nIncoming body';
    snapshot.nodesById['article-1']!.currentVersionId = 'incoming-version';
    snapshot.nodesById['article-1']!.updatedAt = '2026-10-14T13:00:00.000Z';
    await act(async () => gate.resolve(snapshot));
    expect(await screen.findByText('Incoming body')).toBeVisible();
    expect(view.container.querySelector('section')).toBe(surface);
    expect(screen.getByRole('button', { name: 'Outline' })).toBeVisible();
    expect(surface.scrollTop).toBe(180);
  }
);
