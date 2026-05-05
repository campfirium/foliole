import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { useWorkspaceHydration } from './useWorkspaceHydration';

const { useWorkspaceStore } = vi.hoisted(() => ({
  useWorkspaceStore: vi.fn()
}));

vi.mock('../../store/workspaceStore', () => ({
  useWorkspaceStore
}));

beforeEach(() => {
  useWorkspaceStore.mockReset();
});

it('returns the workspace hydration flag from the store', async () => {
  useWorkspaceStore.mockImplementation((selector: (state: { isHydrated: boolean }) => boolean) =>
    selector({ isHydrated: true })
  );

  const { result } = renderHook(() => useWorkspaceHydration());

  await waitFor(() => {
    expect(result.current).toBe(true);
  });
});

it('reacts when the store hydration flag changes', async () => {
  let hydrated = false;
  useWorkspaceStore.mockImplementation((selector: (state: { isHydrated: boolean }) => boolean) =>
    selector({ isHydrated: hydrated })
  );

  const { result, rerender } = renderHook(() => useWorkspaceHydration());

  expect(result.current).toBe(false);

  act(() => {
    hydrated = true;
    rerender();
  });

  await waitFor(() => {
    expect(result.current).toBe(true);
  });
});
