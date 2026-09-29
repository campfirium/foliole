// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

const saveActive = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock('../shared/platform/companionSyncObjects', () => ({
  saveCompanionSyncActiveViewState: saveActive,
  saveCompanionSyncNodeViewState: vi.fn(async () => undefined)
}));

import { useCompanionViewStateSync } from './useCompanionViewStateSync';

it('does not clear a saved active node during the empty startup view', () => {
  const args: Parameters<typeof useCompanionViewStateSync>[0] = { activeAction: 'recent', readableArticleNodeId: null,
    reviewNodeId: null, selectedBrowseNodeId: null };
  const { rerender } = renderHook((value) => useCompanionViewStateSync(value),
    { initialProps: args });
  expect(saveActive).not.toHaveBeenCalled();
  rerender({ ...args, selectedBrowseNodeId: 'node-1' });
  expect(saveActive).toHaveBeenCalledExactlyOnceWith('node-1');
  rerender({ ...args, selectedBrowseNodeId: 'node-1' });
  expect(saveActive).toHaveBeenCalledTimes(1);
  rerender(args);
  expect(saveActive).toHaveBeenLastCalledWith(null);
});
