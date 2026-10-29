import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { useWorkspaceStore } from '../../../store/workspaceStore';

const mocks = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock('../../../shared/platform/runtime/reviewCalendarRuntimeRepository', () => ({
  loadReviewCalendarHistoryFromRuntime: mocks.load
}));

import { useReviewCalendar } from './useReviewCalendar';

afterEach(cleanup);

it('keeps a calendar snapshot through workspace changes and reads new database counts on reopen', async () => {
  const original = useWorkspaceStore.getState();
  const day = new Date().toISOString().slice(0, 10);
  mocks.load.mockResolvedValue({ days: [], topicCoverageFrom: '2026-01-01',
    scheduledDays: [{ day, items: 2, topics: 3 }] });
  try {
    useWorkspaceStore.setState({ libraryScope: 'calendar-library', nodesById: {}, nodeOrder: [], trashedNodeIds: [] });
    const hook = renderHook(useReviewCalendar);
    await waitFor(() => expect(hook.result.current.counts(day).topics).toBe(3));
    act(() => useWorkspaceStore.setState({ nodesById: {}, trashedNodeIds: ['other'] }));
    expect(mocks.load).toHaveBeenCalledTimes(1);
    hook.unmount();
    mocks.load.mockResolvedValue({ days: [], topicCoverageFrom: '2026-01-01', scheduledDays: [{ day, items: 2, topics: 5 }] });
    const reopened = renderHook(useReviewCalendar);
    await waitFor(() => expect(reopened.result.current.counts(day).topics).toBe(5));
    expect(mocks.load).toHaveBeenCalledTimes(2);
  } finally { cleanup(); useWorkspaceStore.setState(original); }
});
