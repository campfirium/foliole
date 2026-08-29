import { act, renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { useTrashView } from './useTrashView';

it('clears the previous active node at the shared trash-view entry point', () => {
  const clearActiveNode = vi.fn();
  const { result } = renderHook(() => useTrashView({ clearActiveNode, trashedNodeIds: [] }));

  act(() => result.current.openTrashView());

  expect(clearActiveNode).toHaveBeenCalledTimes(1);
  expect(result.current.isTrashViewOpen).toBe(true);
});
