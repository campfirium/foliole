import { act, render, renderHook, screen } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CompanionBottomSheet } from './CompanionBottomSheet';
import type { CompanionShellModel } from './CompanionShell';
import { useCompanionAndroidBack } from './useCompanionAndroidBack';

const host = vi.hoisted(() => ({ listener: null as null | (() => void), exitApp: vi.fn() }));
vi.mock('@capacitor/core', () => ({ Capacitor: { getPlatform: () => 'android' } }));
vi.mock('@capacitor/app', () => ({ App: {
  addListener: vi.fn(async (_event: string, listener: () => void) => {
    host.listener = listener;
    return { remove: vi.fn(async () => undefined) };
  }),
  exitApp: host.exitApp
} }));

function model(action: 'recent' | 'review' | 'more' | 'search') {
  const handleTabAction = vi.fn();
  const handleExitBrowseArticle = vi.fn();
  const handleNavigationAction = vi.fn();
  const result = {
    directorySelection: { kind: 'root' },
    handleExitSearchArticle: vi.fn(),
    handleExitSearchExternalDocument: vi.fn(),
    handleExitSearchPdf: vi.fn(),
    handleNavigationAction,
    isBrowseDirectoryOpen: false,
    isCaptureSheetOpen: false,
    isOnlyReviewOpen: false,
    isSearchArticleOpen: false,
    searchExternalDocument: null,
    searchPdfResult: null,
    setDirectorySelection: vi.fn(),
    settingsPage: 'list',
    surface: { activeAction: action, handleExitBrowseArticle, handleTabAction, selectedBrowseNodeId: null as string | null },
    topBarProps: {}
  };
  return result;
}

async function pressBack(state: ReturnType<typeof model>) {
  renderHook(() => useCompanionAndroidBack(state as unknown as CompanionShellModel));
  await act(async () => undefined);
  act(() => host.listener?.());
}

describe('Android system Back navigation', () => {
  beforeEach(() => { host.listener = null; host.exitApp.mockClear(); });

  it('returns a recent article to its source without grading or leaving the app', async () => {
    const state = model('recent');
    state.surface.selectedBrowseNodeId = 'topic-1';
    await pressBack(state);
    expect(state.surface.handleExitBrowseArticle).toHaveBeenCalledOnce();
    expect(host.exitApp).not.toHaveBeenCalled();
  });

  it('returns Only Review to Flow, then Flow to Recent', async () => {
    const state = model('review');
    state.isOnlyReviewOpen = true;
    await pressBack(state);
    expect(state.handleNavigationAction).toHaveBeenCalledWith('review');
    state.isOnlyReviewOpen = false;
    act(() => host.listener?.());
    expect(state.handleNavigationAction).toHaveBeenCalledWith('recent');
    expect(host.exitApp).not.toHaveBeenCalled();
  });

  it('leaves the directory at its root through the existing navigation action', async () => {
    const state = model('recent');
    state.isBrowseDirectoryOpen = true;
    await pressBack(state);
    expect(state.handleNavigationAction).toHaveBeenCalledWith('recent');
    expect(host.exitApp).not.toHaveBeenCalled();
  });

  it('returns a nested settings page through its visible Back action', async () => {
    const state = model('more');
    state.settingsPage = 'sync';
    const onBack = vi.fn();
    state.topBarProps = { onBack };
    await pressBack(state);
    expect(onBack).toHaveBeenCalledOnce();
    expect(host.exitApp).not.toHaveBeenCalled();
  });
});

describe('Android system Back dismissal', () => {
  beforeEach(() => { host.listener = null; host.exitApp.mockClear(); });

  it('closes a dialog before changing the article or page', async () => {
    const state = model('recent');
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('data-state', 'open');
    document.body.append(dialog);
    const keydown = vi.fn();
    document.addEventListener('keydown', keydown);
    await pressBack(state);
    expect(keydown).toHaveBeenCalledWith(expect.objectContaining({ key: 'Escape' }));
    expect(host.exitApp).not.toHaveBeenCalled();
    document.removeEventListener('keydown', keydown);
    dialog.remove();
  });

  it('returns a root page to Android', async () => {
    await pressBack(model('search'));
    expect(host.exitApp).toHaveBeenCalledOnce();
  });

  it('closes the actual top sheet without leaving the page', async () => {
    function Fixture() {
      const [open, setOpen] = useState(true);
      return <CompanionBottomSheet onOpenChange={setOpen} open={open} title="Options">Options</CompanionBottomSheet>;
    }
    render(<Fixture />);
    await pressBack(model('recent'));
    expect(screen.queryByRole('dialog', { name: 'Options' })).not.toBeInTheDocument();
    expect(host.exitApp).not.toHaveBeenCalled();
  });
});
