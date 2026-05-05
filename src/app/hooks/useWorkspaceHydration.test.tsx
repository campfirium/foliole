import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { useWorkspaceHydration } from './useWorkspaceHydration';

const { hasHydrated, onFinishHydration, onHydrate } = vi.hoisted(() => ({
  hasHydrated: vi.fn(),
  onFinishHydration: vi.fn(),
  onHydrate: vi.fn()
}));

vi.mock('../../store/workspaceStore', () => ({
  useWorkspaceStore: {
    persist: {
      hasHydrated,
      onFinishHydration,
      onHydrate
    }
  }
}));

beforeEach(() => {
  hasHydrated.mockReset();
  onFinishHydration.mockReset();
  onHydrate.mockReset();
  onHydrate.mockReturnValue(() => undefined);
  onFinishHydration.mockReturnValue(() => undefined);
});

it('picks up an already-finished hydration even if it completed before listeners attached', async () => {
  hasHydrated.mockReturnValueOnce(false).mockReturnValue(true);

  const { result } = renderHook(() => useWorkspaceHydration());

  await waitFor(() => {
    expect(result.current).toBe(true);
  });
});

it('updates to true when hydration finishes after mount', async () => {
  hasHydrated.mockReturnValue(false);
  let finishHydration: (() => void) | null = null;
  onFinishHydration.mockImplementation((callback: () => void) => {
    finishHydration = callback;
    return () => undefined;
  });

  const { result } = renderHook(() => useWorkspaceHydration());

  expect(result.current).toBe(false);
  if (!finishHydration) {
    throw new Error('expected finish hydration listener');
  }

  act(() => {
    finishHydration?.();
  });

  await waitFor(() => {
    expect(result.current).toBe(true);
  });
});
