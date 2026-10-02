import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { createReadingNode, createReadingProfile } from '../../../store/reviewQueuePlanner.test-support';
import { useWorkspaceStore } from '../../../store/workspaceStore';

vi.mock('../../../shared/platform/runtime/reviewCalendarRuntimeRepository', () => ({
  loadReviewCalendarHistoryFromRuntime: vi.fn(async () => ({ days: [], topicCoverageFrom: '2026-10-02' }))
}));

import { useReviewCalendar } from './useReviewCalendar';

afterEach(() => { cleanup(); vi.useRealTimers(); });

it('updates an open calendar from the real workspace store when due dates, Trash and restore change', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 2, 12));
  const original = useWorkspaceStore.getState();
  const due = new Date(2026, 9, 3, 12).toISOString();
  const topic = createReadingNode('calendar-topic', due, 'Reading content', createReadingProfile(due));
  try {
    useWorkspaceStore.setState({ nodesById: { [topic.id]: topic }, nodeOrder: [topic.id], trashedNodeIds: [] });
    const { result, unmount } = renderHook(useReviewCalendar);
    await act(async () => {});
    expect(result.current.counts('2026-10-03').topics).toBe(1);
    act(() => useWorkspaceStore.setState({ trashedNodeIds: [topic.id] }));
    expect(result.current.counts('2026-10-03').topics).toBe(0);
    act(() => useWorkspaceStore.setState({ trashedNodeIds: [] }));
    expect(result.current.counts('2026-10-03').topics).toBe(1);
    act(() => useWorkspaceStore.setState({ nodesById: {
      [topic.id]: { ...topic, reading: { ...topic.reading!, nextAt: new Date(2026, 9, 4, 12).toISOString() } }
    } }));
    expect(result.current.counts('2026-10-03').topics).toBe(0);
    expect(result.current.counts('2026-10-04').topics).toBe(1);
    unmount();
  } finally { cleanup(); useWorkspaceStore.setState(original); }
});
