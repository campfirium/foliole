import { renderHook } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

const requestWorkspaceNodeDocumentPreload = vi.hoisted(() => vi.fn());

vi.mock('../../store/workspaceNodeDocumentPrefetch', () => ({
  requestWorkspaceNodeDocumentPreload
}));

import { useReviewQueueDocumentPrefetch } from './useReviewQueueDocumentPrefetch';

beforeEach(() => {
  requestWorkspaceNodeDocumentPreload.mockReset();
});

it('prefetches only the item immediately after the current review item', () => {
  const { rerender } = renderHook(
    (props: { currentNodeId: string; queueNodeIds: string[] }) =>
      useReviewQueueDocumentPrefetch(props),
    {
      initialProps: {
        currentNodeId: 'node-1',
        queueNodeIds: ['node-1', 'node-2', 'node-3']
      }
    }
  );

  expect(requestWorkspaceNodeDocumentPreload).toHaveBeenLastCalledWith(['node-2']);

  rerender({
    currentNodeId: 'node-2',
    queueNodeIds: ['node-1', 'node-2', 'node-3']
  });

  expect(requestWorkspaceNodeDocumentPreload).toHaveBeenLastCalledWith(['node-3']);
  expect(requestWorkspaceNodeDocumentPreload).toHaveBeenCalledTimes(2);
});
