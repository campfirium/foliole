import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

const load = vi.hoisted(() => vi.fn());
vi.mock('../../../shared/platform/desktop/foregroundTimeRuntimeRepository', () => ({ loadForegroundTimeHistoryFromRuntime: load }));
vi.mock('../../../shared/platform/companionBootstrap', () => ({ isNativeCompanionRuntime: () => false }));

import { useForegroundTimeHistory } from './useForegroundTimeHistory';

afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });
it('distinguishes unavailable, zero and future dates and pauses refresh while the window is inactive', async () => {
  load.mockResolvedValue({ coverageFrom: '2026-10-02', totalDurationMs: 150_000, days: [{ day: '2026-10-04', durationMs: 70_000 }] });
  vi.spyOn(document, 'hasFocus').mockReturnValue(true);
  const { result } = renderHook(() => useForegroundTimeHistory('2026-10-01', '2026-11-01', '2026-10-04'));
  await waitFor(() => expect(result.current.duration('2026-10-04')).toBe(70_000));
  expect(result.current.duration('2026-10-01')).toBeNull();
  expect(result.current.duration('2026-10-03')).toBe(0);
  expect(result.current.duration('2026-10-05')).toBeNull();
  expect(result.current.totalDurationMs).toBe(150_000);
  act(() => { window.dispatchEvent(new Event('blur')); });
  vi.useFakeTimers(); const calls = load.mock.calls.length;
  await act(async () => { await vi.advanceTimersByTimeAsync(600_000); });
  expect(load).toHaveBeenCalledTimes(calls);
  await act(async () => { window.dispatchEvent(new Event('focus')); });
  expect(load).toHaveBeenCalledTimes(calls + 1);
  await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
  expect(load).toHaveBeenCalledTimes(calls + 2);
});

it('does not show a stale or invented total after loading fails and recovers it on retry', async () => {
  load.mockRejectedValue(new Error('unavailable'));
  const { result } = renderHook(() => useForegroundTimeHistory('2026-10-01', '2026-11-01', '2026-10-04'));
  await waitFor(() => expect(result.current.failed).toBe(true));
  expect(result.current.totalDurationMs).toBeNull();
  load.mockResolvedValue({ coverageFrom: '2026-10-01', totalDurationMs: 80_000, days: [] });
  act(() => result.current.retry());
  await waitFor(() => expect(result.current.totalDurationMs).toBe(80_000));
  expect(result.current.failed).toBe(false);
});
