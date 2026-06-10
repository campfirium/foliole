import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useCompanionArticleSurface } from './useCompanionArticleSurface';
import {
  createCompanionArticleSnapshot,
  createFloatingBar,
  createWorkspaceSync
} from './useCompanionArticleSurfaceTestSupport';

describe('useCompanionArticleSurface sync ready gate', () => {
  it('opens review after local sync state is ready with a snapshot', async () => {
    const snapshot = createCompanionArticleSnapshot();
    const initialSync = { ...createWorkspaceSync(null), isWorkspaceSyncStateReady: false };
    const readySync = { ...createWorkspaceSync(snapshot), isWorkspaceSyncStateReady: true };
    const { result, rerender } = renderHook(
      ({ workspaceSync }) => useCompanionArticleSurface(workspaceSync, createFloatingBar()),
      { initialProps: { workspaceSync: initialSync } }
    );

    expect(result.current.activeAction).toBe('more');

    rerender({ workspaceSync: readySync });

    await waitFor(() => expect(result.current.activeAction).toBe('review'));
  });

  it('keeps settings as the first surface after ready when no snapshot exists', async () => {
    const initialSync = { ...createWorkspaceSync(null), isWorkspaceSyncStateReady: false };
    const readySync = { ...createWorkspaceSync(null), isWorkspaceSyncStateReady: true };
    const { result, rerender } = renderHook(
      ({ workspaceSync }) => useCompanionArticleSurface(workspaceSync, createFloatingBar()),
      { initialProps: { workspaceSync: initialSync } }
    );

    rerender({ workspaceSync: readySync });

    await waitFor(() => expect(result.current.activeAction).toBe('more'));
  });

  it('does not replace a user-selected tab when sync state becomes ready', async () => {
    const snapshot = createCompanionArticleSnapshot();
    const initialSync = { ...createWorkspaceSync(null), isWorkspaceSyncStateReady: false };
    const readySync = { ...createWorkspaceSync(snapshot), isWorkspaceSyncStateReady: true };
    const { result, rerender } = renderHook(
      ({ workspaceSync }) => useCompanionArticleSurface(workspaceSync, createFloatingBar()),
      { initialProps: { workspaceSync: initialSync } }
    );

    act(() => result.current.handleTabAction('search'));
    rerender({ workspaceSync: readySync });

    await waitFor(() => expect(result.current.activeAction).toBe('search'));
  });
});
