import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

const onWorkspaceSyncApplied = vi.hoisted(() => vi.fn());

vi.mock('../../shared/platform/runtimeShellEvents', async () => ({
  ...await vi.importActual<typeof import('../../shared/platform/runtimeShellEvents')>('../../shared/platform/runtimeShellEvents'),
  onWorkspaceSyncApplied
}));

import { useWorkspaceStore } from '../../store/workspaceStore';

import { useWorkspaceSyncAppliedRefresh } from './useWorkspaceSyncAppliedRefresh';

beforeEach(() => {
  vi.restoreAllMocks();
  onWorkspaceSyncApplied.mockReset();
});

it('rehydrates the desktop workspace when sync changes are applied by the runtime', async () => {
  let handler: (() => void) | null = null;
  const unlisten = vi.fn();
  onWorkspaceSyncApplied.mockImplementation(async (nextHandler: () => void) => {
    handler = nextHandler;
    return unlisten;
  });
  const rehydrate = vi.spyOn(useWorkspaceStore.persist, 'rehydrate').mockResolvedValue();

  const view = renderHook(() => useWorkspaceSyncAppliedRefresh());
  await waitFor(() => expect(onWorkspaceSyncApplied).toHaveBeenCalledTimes(1));
  await act(async () => {
    handler?.();
  });

  expect(rehydrate).toHaveBeenCalledTimes(1);
  view.unmount();
  expect(unlisten).toHaveBeenCalledTimes(1);
});
