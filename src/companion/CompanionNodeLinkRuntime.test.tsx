import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ receive: null as null | ((url: string) => void), loadGroup: vi.fn() }));
vi.mock('../shared/platform/companion/navigation/mobileNodeLinkRuntime', () => ({
  subscribeMobileNodeLinks: (receive: (url: string) => void) => { mocks.receive = receive; return vi.fn(); }
}));
vi.mock('../shared/platform/companion/sync/syncGroupStore', () => ({ loadCompanionSyncGroup: mocks.loadGroup }));

import { CompanionNodeLinkRuntime } from './CompanionNodeLinkRuntime';
import type { CompanionShellModel } from './CompanionShell';
import { createCompanionArticleSnapshot } from './useCompanionArticleSurfaceTestSupport';

function model() {
  return { workspaceSync: { isWorkspaceSyncStateReady: true, state: { workspace_snapshot: createCompanionArticleSnapshot() } },
    isCaptureSheetOpen: false, surface: { isSubmittingGrade: false, isSubmittingReadingAction: false,
      handleSelectRecentArticle: vi.fn() }, handleNavigationAction: vi.fn(),
    handleExitSearchExternalDocument: vi.fn(), handleExitSearchPdf: vi.fn()
  } as unknown as CompanionShellModel;
}
const url = 'foliole://node/v1?group=group-A&id=article-2';

beforeEach(() => { mocks.loadGroup.mockResolvedValue({ group_id: 'group-A' }); });

describe('companion system link entry', () => {
  it('opens through existing navigation and clears search overlays', async () => {
    const state = model();
    render(<CompanionNodeLinkRuntime model={state}><div>Current page</div></CompanionNodeLinkRuntime>);
    await act(async () => { mocks.receive!(url); });
    expect(state.handleNavigationAction).toHaveBeenCalledWith('recent');
    expect(state.handleExitSearchExternalDocument).toHaveBeenCalled();
    expect(state.handleExitSearchPdf).toHaveBeenCalled();
    expect(state.surface.handleSelectRecentArticle).toHaveBeenCalledWith('article-2');
  });
  it('keeps Capture draft open until the user leaves it', async () => {
    const state = model();
    state.isCaptureSheetOpen = true;
    const view = render(<CompanionNodeLinkRuntime model={state}><div>Draft</div></CompanionNodeLinkRuntime>);
    await act(async () => { mocks.receive!(url); });
    expect(state.surface.handleSelectRecentArticle).not.toHaveBeenCalled();
    state.isCaptureSheetOpen = false;
    view.rerender(<CompanionNodeLinkRuntime model={state}><div>Current page</div></CompanionNodeLinkRuntime>);
    await vi.waitFor(() => expect(state.surface.handleSelectRecentArticle).toHaveBeenCalledWith('article-2'));
  });
  it('leaves the current page and navigation intact on missing target', async () => {
    const state = model();
    render(<CompanionNodeLinkRuntime model={state}><div>Current page</div></CompanionNodeLinkRuntime>);
    await act(async () => { mocks.receive!(url.replace('article-2', 'absent')); });
    expect(screen.getByText('Current page')).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent('This link cannot be opened in this library.');
    expect(state.handleNavigationAction).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('status')).toBeNull();
  });
});
