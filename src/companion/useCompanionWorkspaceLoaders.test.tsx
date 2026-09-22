import { act, renderHook } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';

import { CompanionReadingSnapshotChanged } from '../shared/platform/companion/reading/companionReadingDemand';
import { invalidateCompanionReadingScope } from '../shared/platform/companion/reading/companionReadingScope';

import { useCompanionWorkspaceLoaders } from './useCompanionWorkspaceLoaders';
import { createSnapshot, createSyncState } from './useCompanionWorkspaceSync.testSupport';

const mocks = vi.hoisted(() => ({ read: vi.fn(), refresh: vi.fn() }));
vi.mock('../shared/platform/companionWorkspaceSync', () => ({
  loadCompanionReadableArticle: mocks.read, loadCompanionWorkspaceSyncState: mocks.refresh
}));
vi.mock('../shared/platform/appLifecycle', () => ({ subscribeNativeAppForeground: vi.fn(async () => () => undefined) }));
vi.mock('./useCompanionVirtualFolderLoader', () => ({ useCompanionVirtualFolderLoader: () => vi.fn() }));

beforeEach(() => {
  mocks.read.mockReset().mockRejectedValue(new CompanionReadingSnapshotChanged());
  mocks.refresh.mockReset();
});

it('does not publish a stale catalog refresh after changing the database lifetime', async () => {
  const initial = createSyncState(createSnapshot());
  let finish!: (state: typeof initial) => void;
  mocks.refresh.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  const { result } = renderHook(() => {
    const [state, setState] = useState(initial);
    const [, setArticle] = useState(null);
    const loaders = useCompanionWorkspaceLoaders({ state, setState, setReadableArticle: setArticle as () => void, setError: vi.fn() });
    return { state, ...loaders };
  });
  let pending!: Promise<unknown>;
  await act(async () => { pending = result.current.openReadableArticle('topic-1'); await Promise.resolve(); });
  expect(mocks.refresh).toHaveBeenCalledTimes(1);
  await act(async () => {
    invalidateCompanionReadingScope();
    finish({ ...initial, endpoint_url: 'old-library' });
    await pending;
  });
  expect(result.current.state).toBe(initial);
});
