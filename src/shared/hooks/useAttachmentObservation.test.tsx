import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { runAttachmentMaintenance } from '../platform/attachments/attachmentMaintenance';

import { useAttachmentObservation } from './useAttachmentObservation';

vi.mock('../platform/attachments/attachmentMaintenance', () => ({ runAttachmentMaintenance: vi.fn() }));
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

it('cancels idle maintenance on interaction and starts a fresh attempt after another idle period', async () => {
  vi.useFakeTimers();
  const signals: AbortSignal[] = [];
  vi.mocked(runAttachmentMaintenance).mockImplementation((_request, signal) => {
    if (!signal) throw new Error('Missing cancellation signal');
    signals.push(signal);
    return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
  });
  const hook = renderHook(() => useAttachmentObservation(true));
  await act(() => vi.advanceTimersByTimeAsync(60000));
  expect(signals).toHaveLength(1);
  await act(async () => { window.dispatchEvent(new Event('pointerdown')); });
  expect(signals[0]?.aborted).toBe(true);
  await act(() => vi.advanceTimersByTimeAsync(59999));
  expect(signals).toHaveLength(1);
  await act(() => vi.advanceTimersByTimeAsync(1));
  expect(signals).toHaveLength(2);
  hook.unmount();
  expect(signals[1]?.aborted).toBe(true);
});

it('retries incomplete observations after idle and marks only complete results as done for today', async () => {
  vi.useFakeTimers();
  vi.mocked(runAttachmentMaintenance).mockResolvedValueOnce({ observationComplete: false } as never)
    .mockResolvedValue({ observationComplete: true } as never);
  const hook = renderHook(() => useAttachmentObservation(true));
  await act(() => vi.advanceTimersByTimeAsync(60000));
  expect(runAttachmentMaintenance).toHaveBeenCalledTimes(1);
  await act(() => vi.advanceTimersByTimeAsync(60000));
  expect(runAttachmentMaintenance).toHaveBeenCalledTimes(2);
  await act(() => vi.advanceTimersByTimeAsync(60000));
  expect(runAttachmentMaintenance).toHaveBeenCalledTimes(2);
  hook.unmount();
});
