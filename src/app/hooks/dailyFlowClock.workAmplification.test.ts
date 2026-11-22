import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { DailyFlowView, DailyFlowViewArgs } from '../../../lib/core/flow/dailyFlowViewContract';
import { loadDailyFlowViewRuntime } from '../../shared/platform/runtime/dailyFlowRuntimeRepository';

import { useNowIso } from './appControllerState';
import { DAILY_FLOW_CLOCK_MAX_WAIT_MS } from './dailyFlowClock';
import { useDailyFlowView } from './useDailyFlowView';

vi.mock('../../shared/platform/runtime/dailyFlowRuntimeRepository', () => ({
  hasDailyFlowRuntime: () => true, loadDailyFlowViewRuntime: vi.fn()
}));

const start = '2026-11-22T08:00:00.000Z';
const MINUTE = 60_000;
const at = (offsetMs: number) => new Date(Date.parse(start) + offsetMs).toISOString();

const session = { currentNodeId: null, queueNodeIds: [], totalNodeCount: 0, isAnswerRevealed: false };
const input = { libraryScope: 'a', reviewSession: session, reviewSessionMode: 'recommended' as const, nodesById: {},
  nodeOrder: ['a', 'b'], trashedNodeIds: [] as string[], includeEntries: false, enabled: true };

/** A view whose review becomes doable at `dueAt`; until then only `dueAt` itself can change it. */
function serveFlow(dueAt: string, after: string) {
  vi.mocked(loadDailyFlowViewRuntime).mockImplementation(async (args: DailyFlowViewArgs) => {
    const due = Date.parse(args.now) >= Date.parse(dueAt);
    const view: DailyFlowView = { status: 'ready', scope: 'a', dayKey: 'day', revision: 1, now: args.now,
      mode: 'recommended', currentNodeId: null, nodeIds: null, complete: false, canContinueReading: false,
      modeAvailability: { recommended: due, 'review-first': due, 'reading-only': false },
      nextChangeAt: due ? after : dueAt };
    return { view, nodes: undefined };
  });
}

let renders = 0;
function useWorkspaceFlow(props: typeof input) {
  renders++;
  const now = useNowIso();
  return useDailyFlowView({ ...props, now });
}

const reads = () => vi.mocked(loadDailyFlowViewRuntime).mock.calls.length;
const lastReadAt = () => vi.mocked(loadDailyFlowViewRuntime).mock.lastCall![0].now;
const wait = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date(start));
  renders = 0;
});
afterEach(() => { vi.useRealTimers(); });

it('reads Flow once while nothing can change it and again exactly when a review falls due', async () => {
  serveFlow(at(8 * MINUTE), at(16 * 60 * MINUTE));
  const app = renderHook(useWorkspaceFlow, { initialProps: input });
  await wait(0);
  expect(reads()).toBe(1);
  expect(app.result.current?.view?.modeAvailability.recommended).toBe(false);
  const settled = renders;

  // The old 15 s clock read Flow 31 more times here and re-rendered the workspace each time.
  await wait(8 * MINUTE - 1_000);
  expect(reads()).toBe(1);
  expect(renders).toBe(settled);

  await wait(1_100);
  expect(reads()).toBe(2);
  expect(Date.parse(lastReadAt())).toBeGreaterThanOrEqual(Date.parse(at(8 * MINUTE)));
  expect(app.result.current?.view?.modeAvailability.recommended).toBe(true);
  app.unmount();
});

it('still re-reads within the longest wait when a view names no nearer change', async () => {
  serveFlow(at(0), at(16 * 60 * MINUTE));
  const app = renderHook(useWorkspaceFlow, { initialProps: input });
  await wait(0);
  expect(reads()).toBe(1);
  await wait(DAILY_FLOW_CLOCK_MAX_WAIT_MS - 1_000);
  expect(reads()).toBe(1);
  await wait(1_000);
  expect(reads()).toBe(2);
  app.unmount();
});

it('reads again for a real membership change but not for an equal list the store hands over', async () => {
  serveFlow(at(0), at(16 * 60 * MINUTE));
  const app = renderHook(useWorkspaceFlow, { initialProps: input });
  await wait(0);
  expect(reads()).toBe(1);
  app.rerender({ ...input, nodeOrder: [...input.nodeOrder], trashedNodeIds: [] });
  await wait(0);
  expect(reads()).toBe(1);
  app.rerender({ ...input, trashedNodeIds: ['b'] });
  await wait(0);
  expect(reads()).toBe(2);
  app.unmount();
});
