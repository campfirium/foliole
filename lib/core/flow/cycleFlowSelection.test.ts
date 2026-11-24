import { describe, expect, it, vi } from 'vitest';

import type { CycleMeta } from './cycleFlowTypes.js';

vi.mock('./dailyFlowPlanning.js', () => ({
  flowPlan: (snapshot: { nodeOrder: string[] }) => ({ fsrsQueueNodeIds: snapshot.nodeOrder, readingQueueNodeIds: [] })
}));

const { selectCycleSuccessor } = await import('./cycleFlowSelection.js');

const settings = {} as never;
const now = '2026-01-01T00:00:00.000Z';

function row(id: string, key: number) {
  return { node_id: id, order_key: key, active: 1, handled: 0, cohort: 'none', initial_task: 0, kind: null, ready_at_ms: null };
}

function store(timed: ReturnType<typeof row>[]) {
  return {
    scanRows: async () => [],
    timedRows: async () => timed,
    scopedLearningSnapshot: async (ids: string[]) => ({ nodeOrder: ids, nodesById: {}, trashedNodeIds: [] })
  } as never;
}

function meta(scanAfter: number): CycleMeta {
  return { clearKey: 3, clearedAt: null, scanAfter, lapLimit: 3, tailKey: 4, remaining: 0, reviewRemaining: 0 } as CycleMeta;
}

describe('selectCycleSuccessor queue clear mark', () => {
  it('writes the clear mark when a due Again card is served right after the last queue card', async () => {
    const state = meta(3);
    const selected = await selectCycleSuccessor(store([row('again', 4)]), state, { mode: 'recommended', now, settings });
    expect(selected?.node_id).toBe('again');
    expect(state.clearedAt).toBe(now);
  });

  it('keeps the queue open while earlier queue cards remain', async () => {
    const state = meta(1);
    await selectCycleSuccessor(store([row('again', 4)]), state, { mode: 'recommended', now, settings });
    expect(state.clearedAt).toBeNull();
  });
});
