import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { NativeReviewCalendar } from '../../../../lib/platform/nativeReviewCalendarContract';

const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  state: { libraryScope: 'a', nodesById: {}, nodeOrder: [] as string[], trashedNodeIds: [] as string[] }
}));
vi.mock('../../../shared/platform/runtime/reviewCalendarRuntimeRepository', () => ({ loadReviewCalendarHistoryFromRuntime: mocks.load }));
vi.mock('../../../store/workspaceStore', () => ({ useWorkspaceStore: (selector: (state: typeof mocks.state) => unknown) => selector(mocks.state) }));

import { useReviewCalendar } from './useReviewCalendar';

beforeEach(() => {
  vi.clearAllMocks(); mocks.state.nodesById = {}; mocks.state.libraryScope = 'a';
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 2, 12));
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

it('distinguishes unavailable Topic history from known zero and uses recorded history for past dates', async () => {
  mocks.load.mockResolvedValue({ scheduledDays: [], topicCoverageFrom: '2026-09-01', days: [{ day: '2026-09-02', items: 2, topics: 3 }] });
  const { result } = renderHook(useReviewCalendar);
  await waitFor(() => expect(result.current.counts('2026-09-02')).toMatchObject({ items: 2, topics: 3 }));
  expect(result.current.counts('2026-08-02')).toMatchObject({ items: 0, topics: null });
  expect(result.current.counts('2026-09-03')).toMatchObject({ items: 0, topics: 0 });
  expect(result.current.months).toHaveLength(12);
});

it('leaves failed reads unavailable and allows retry without changing scheduled counts', async () => {
  mocks.load.mockRejectedValueOnce(new Error('read failed')).mockResolvedValue({ scheduledDays: [], days: [], topicCoverageFrom: '2026-09-01' });
  const { result } = renderHook(useReviewCalendar);
  await waitFor(() => expect(result.current.failed).toBe(true));
  expect(result.current.counts('2026-09-01')).toMatchObject({ items: null, topics: null });
  expect(result.current.counts(result.current.today)).toMatchObject({ items: null, topics: null });
  act(() => result.current.retry());
  await waitFor(() => expect(result.current.counts('2026-09-01').items).toBe(0));
  expect(result.current.failed).toBe(false);
});

it('refreshes changed data and ignores a late result from a previous workspace', async () => {
  let finishOld!: (value: NativeReviewCalendar) => void;
  mocks.load.mockImplementationOnce(() => new Promise<NativeReviewCalendar>((resolve) => { finishOld = resolve; }))
    .mockResolvedValue({ scheduledDays: [], topicCoverageFrom: '2026-09-01', days: [{ day: '2026-09-02', items: 4, topics: 1 }] });
  const { result, rerender } = renderHook(useReviewCalendar);
  mocks.state.libraryScope = 'b';
  rerender();
  await waitFor(() => expect(result.current.counts('2026-09-02').items).toBe(4));
  await act(async () => finishOld({ scheduledDays: [], topicCoverageFrom: '2026-09-01', days: [{ day: '2026-09-02', items: 99, topics: 99 }] }));
  expect(result.current.counts('2026-09-02')).toMatchObject({ items: 4, topics: 1 });
});


it('uses database counts without refreshing for node mutations or focus, and reloads after reopening', async () => {
  mocks.load.mockResolvedValue({ topicCoverageFrom: '2026-09-01', days: [],
    scheduledDays: [{ day: '2026-10-03', items: 7, topics: 12 }] });
  const hook = renderHook(useReviewCalendar);
  await waitFor(() => expect(hook.result.current.counts('2026-10-03').topics).toBe(12));
  mocks.state.nodesById = { arbitrary: { reading: { nextAt: '2026-10-04' } } };
  hook.rerender();
  act(() => window.dispatchEvent(new Event('focus')));
  expect(mocks.load).toHaveBeenCalledTimes(1);
  hook.unmount();
  renderHook(useReviewCalendar);
  await waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(2));
});
