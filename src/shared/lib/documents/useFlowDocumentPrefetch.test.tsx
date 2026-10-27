import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import type { DailyFlowSession } from '../../../../lib/core/flow/dailyFlowSession';

import { useFlowDocumentPrefetch } from './useFlowDocumentPrefetch';

const session = (currentNodeId: string, revision = 1, scope = 'library'): DailyFlowSession => ({
  currentNodeId, daily: { scope, revision, dayKey: 'day' }, flowFormat: 'cycle-v1',
  queueNodeIds: [currentNodeId], totalNodeCount: 3, isAnswerRevealed: false
});
afterEach(() => vi.useRealTimers());

it('leaves current identity available while prediction is pending and retires late results after another action or scope', async () => {
  vi.useFakeTimers();
  const pending: ((value: string | null) => void)[] = [];
  const predict = vi.fn(() => new Promise<string | null>(resolve => pending.push(resolve)));
  const prepare = vi.fn();
  const hook = renderHook(({ value }) => { useFlowDocumentPrefetch(value, predict, prepare); return value.currentNodeId; },
    { initialProps: { value: session('b') } });
  expect(hook.result.current).toBe('b');
  expect(predict).not.toHaveBeenCalled();
  await act(() => vi.advanceTimersByTimeAsync(16));
  expect(hook.result.current).toBe('b');
  hook.rerender({ value: session('c', 2) });
  await act(async () => pending[0]!('stale'));
  expect(prepare).not.toHaveBeenCalledWith('stale', expect.anything());
  await act(() => vi.advanceTimersByTimeAsync(16));
  hook.rerender({ value: session('other', 1, 'other-library') });
  await act(async () => pending[1]!('old-library'));
  expect(prepare).not.toHaveBeenCalledWith('old-library', expect.anything());
  await act(() => vi.advanceTimersByTimeAsync(16));
  await act(async () => pending[2]!('next'));
  expect(prepare).toHaveBeenLastCalledWith('next', 'other');
  hook.unmount();
  expect(prepare).toHaveBeenLastCalledWith(null, null);
});

it('treats a failed or missed prediction as optional work and discards an unmounted result', async () => {
  vi.useFakeTimers();
  const predict = vi.fn().mockRejectedValueOnce(new Error('read failed')).mockResolvedValueOnce(null);
  const prepare = vi.fn();
  const hook = renderHook(({ value }) => { useFlowDocumentPrefetch(value, predict, prepare); return value.currentNodeId; },
    { initialProps: { value: session('b') } });
  await act(() => vi.advanceTimersByTimeAsync(16));
  expect(hook.result.current).toBe('b');
  hook.rerender({ value: session('c', 2) });
  await act(() => vi.advanceTimersByTimeAsync(16));
  expect(prepare).toHaveBeenLastCalledWith(null, 'c');
  let release!: (id: string) => void;
  predict.mockImplementationOnce(() => new Promise<string>(resolve => { release = resolve; }));
  hook.rerender({ value: session('d', 3) });
  await act(() => vi.advanceTimersByTimeAsync(16));
  hook.unmount();
  await act(async () => release('late'));
  expect(prepare).not.toHaveBeenCalledWith('late', expect.anything());
});

it('does not start a forecast canceled by an immediate ordinary action', async () => {
  vi.useFakeTimers();
  const predict = vi.fn().mockResolvedValue('c');
  const prepare = vi.fn();
  const hook = renderHook(() => useFlowDocumentPrefetch(session('b'), predict, prepare));
  act(() => hook.result.current());
  await act(() => vi.advanceTimersByTimeAsync(16));
  expect(predict).not.toHaveBeenCalled();
  hook.unmount();
});
