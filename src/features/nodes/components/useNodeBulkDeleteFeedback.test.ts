import { act, renderHook, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { useNodeBulkDeleteFeedback } from './useNodeBulkDeleteFeedback';

it('keeps bulk deletion feedback until the mutation settles', async () => {
  let finish!: () => void;
  const pending = new Promise<void>((resolve) => { finish = resolve; });
  const deleteNodes = vi.fn(() => pending);
  const { result } = renderHook(() => useNodeBulkDeleteFeedback(deleteNodes, vi.fn()));
  act(() => result.current.runDeleteNodes(['a', 'b']));
  await waitFor(() => expect(deleteNodes).toHaveBeenCalledWith(['a', 'b']));
  expect(result.current.deleteStatusLabel).not.toBeNull();
  await act(async () => { finish(); await pending; });
  expect(result.current.deleteStatusLabel).toBeNull();
});
