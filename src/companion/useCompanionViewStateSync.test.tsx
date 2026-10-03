// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const saves = vi.hoisted(() => ({
  active: vi.fn(async () => undefined),
  position: vi.fn<(args: { nodeId: string; scrollTop: number }) => Promise<void>>(async () => undefined),
  background: null as (() => void) | null,
  unsubscribe: vi.fn()
}));
vi.mock('../shared/platform/companionSyncObjects', () => ({
  saveCompanionSyncActiveViewState: saves.active,
  saveCompanionSyncNodeViewState: saves.position
}));
vi.mock('../shared/platform/appLifecycle', () => ({
  subscribeNativeAppBackground: async (handler: () => void) => {
    saves.background = handler;
    return saves.unsubscribe;
  }
}));

import { useCompanionViewStateSync } from './useCompanionViewStateSync';

function view(nodeId: string | null): Parameters<typeof useCompanionViewStateSync>[0] {
  return { activeAction: 'recent', readableArticleNodeId: nodeId,
    reviewNodeId: null, selectedBrowseNodeId: nodeId };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  saves.background = null;
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

it('does not clear a saved active node during the empty startup view', () => {
  const { rerender } = renderHook(useCompanionViewStateSync, { initialProps: view(null) });
  expect(saves.active).not.toHaveBeenCalled();
  rerender(view('node-1'));
  expect(saves.active).toHaveBeenCalledExactlyOnceWith('node-1');
  rerender(view('node-1'));
  expect(saves.active).toHaveBeenCalledTimes(1);
  rerender(view(null));
  expect(saves.active).toHaveBeenLastCalledWith(null);
});

it('coalesces scrolling within one article to the last position', () => {
  const hook = renderHook(useCompanionViewStateSync, { initialProps: view('one') });
  act(() => { hook.result.current(100); vi.advanceTimersByTime(400); hook.result.current(240); });
  expect(saves.position).not.toHaveBeenCalled();
  act(() => vi.advanceTimersByTime(800));
  expect(saves.position).toHaveBeenCalledExactlyOnceWith({ nodeId: 'one', scrollTop: 240 });
  hook.unmount();
  expect(saves.position).toHaveBeenCalledTimes(1);
});

it('saves the departing article before a quick scroll in the next article', () => {
  const hook = renderHook(useCompanionViewStateSync, { initialProps: view('one') });
  act(() => hook.result.current(240));
  hook.rerender(view('two'));
  act(() => hook.result.current(80));
  expect(saves.position).toHaveBeenCalledExactlyOnceWith({ nodeId: 'one', scrollTop: 240 });
  act(() => vi.advanceTimersByTime(800));
  expect(saves.position.mock.calls).toEqual([
    [{ nodeId: 'one', scrollTop: 240 }], [{ nodeId: 'two', scrollTop: 80 }]
  ]);
});

it('saves the final position when leaving the article before the debounce', () => {
  const hook = renderHook(useCompanionViewStateSync, { initialProps: view('one') });
  act(() => hook.result.current(350));
  hook.rerender(view(null));
  expect(saves.position).toHaveBeenCalledExactlyOnceWith({ nodeId: 'one', scrollTop: 350 });
  act(() => vi.advanceTimersByTime(1000));
  expect(saves.position).toHaveBeenCalledTimes(1);
});

it('saves the final position on unmount without a second delayed write', () => {
  const hook = renderHook(useCompanionViewStateSync, { initialProps: view('one') });
  act(() => hook.result.current(420));
  hook.unmount();
  expect(saves.position).toHaveBeenCalledExactlyOnceWith({ nodeId: 'one', scrollTop: 420 });
  act(() => vi.advanceTimersByTime(1000));
  expect(saves.position).toHaveBeenCalledTimes(1);
});

it('flushes on background and removes the subscription on unmount', async () => {
  const hook = renderHook(useCompanionViewStateSync, { initialProps: view('one') });
  await act(async () => {});
  act(() => { hook.result.current(480); saves.background?.(); saves.background?.(); });
  expect(saves.position).toHaveBeenCalledExactlyOnceWith({ nodeId: 'one', scrollTop: 480 });
  hook.unmount();
  expect(saves.unsubscribe).toHaveBeenCalledTimes(1);
});

it('can save later scrolls after a rejected position write', async () => {
  saves.position.mockRejectedValueOnce(new Error('temporary write failure'));
  const hook = renderHook(useCompanionViewStateSync, { initialProps: view('one') });
  await act(async () => { hook.result.current(100); await vi.advanceTimersByTimeAsync(800); });
  await act(async () => { hook.result.current(200); await vi.advanceTimersByTimeAsync(800); });
  expect(saves.position).toHaveBeenLastCalledWith({ nodeId: 'one', scrollTop: 200 });
  expect(saves.position).toHaveBeenCalledTimes(2);
});


it('removes a lifecycle subscription that resolves after unmount', async () => {
  const hook = renderHook(useCompanionViewStateSync, { initialProps: view('one') });
  hook.unmount();
  await act(async () => {});
  expect(saves.unsubscribe).toHaveBeenCalledTimes(1);
  expect(saves.position).not.toHaveBeenCalled();
});
