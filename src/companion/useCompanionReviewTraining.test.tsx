import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { getCompanionReadingScope, invalidateCompanionReadingScope } from '../shared/platform/companion/reading/companionReadingScope';

import { useCompanionReviewTraining } from './useCompanionReviewTraining';

const runtime = vi.hoisted(() => ({ plan: vi.fn(), input: vi.fn(), save: vi.fn(), worker: vi.fn(), active: vi.fn(),
  foreground: null as null | (() => void), background: null as null | (() => void), mutation: null as null | (() => void), sync: null as null | (() => void), removed: vi.fn() }));
vi.mock('../shared/platform/appLifecycle', () => ({
  readNativeAppActiveState: runtime.active,
  subscribeNativeAppForeground: async (handler: () => void) => { runtime.foreground = handler; return runtime.removed; },
  subscribeNativeAppBackground: async (handler: () => void) => { runtime.background = handler; return runtime.removed; }
}));
vi.mock('../shared/platform/companion/sync/mutation/companionSyncMutationRevision', () => ({
  subscribeCompanionSyncMutationRevision: (handler: () => void) => { runtime.mutation = handler; return runtime.removed; }
}));
vi.mock('../shared/platform/companion/sync/companionSyncApplied', () => ({
  subscribeCompanionSyncApplied: (handler: () => void) => { runtime.sync = handler; return runtime.removed; }
}));
vi.mock('../shared/platform/desktop/reviewTrainingRuntimeRepository', () => ({
  loadReviewTrainingPlan: runtime.plan, loadReviewTrainingInput: runtime.input, saveReviewTrainingModel: runtime.save
}));
vi.mock('../features/review/model/reviewTrainingWorkerClient', () => ({ runReviewTrainingWorker: runtime.worker }));

const input = { folderId: null, events: [{ opId: 'fixed' }] };
const model = { folderId: null, trainedAt: 'now' };
const tick = (ms = 30000) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
function mount(ready = true, study = false) {
  return renderHook(({ enabled, reviewing }) => useCompanionReviewTraining(enabled, reviewing, null),
    { initialProps: { enabled: ready, reviewing: study } });
}
beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks();
  runtime.active.mockResolvedValue(true);
  runtime.plan.mockResolvedValue({ folders: [{ folderId: null }, { folderId: 'child' }], libraryScope: 'scope' });
  runtime.input.mockResolvedValue(input); runtime.worker.mockResolvedValue(model); runtime.save.mockResolvedValue(null);
});
afterEach(() => { vi.useRealTimers(); });

it('starts automatically only after readiness and uninterrupted foreground idle; data events wake it without polling', async () => {
  const hook = mount(false); await tick(); expect(runtime.plan).not.toHaveBeenCalled();
  hook.rerender({ enabled: true, reviewing: false }); await tick(0);
  await tick(29999); expect(runtime.worker).not.toHaveBeenCalled();
  window.dispatchEvent(new Event('touchstart')); await tick(29999); expect(runtime.worker).not.toHaveBeenCalled();
  await tick(1); expect(runtime.worker).toHaveBeenCalledTimes(2); expect(runtime.save).toHaveBeenCalledTimes(2);
  await tick(90000); expect(runtime.plan).toHaveBeenCalledTimes(1);
  act(() => runtime.mutation!()); await tick(); expect(runtime.plan).toHaveBeenCalledTimes(2);
  act(() => runtime.sync!()); await tick(); expect(runtime.plan).toHaveBeenCalledTimes(3);
  hook.unmount(); expect(runtime.removed).toHaveBeenCalledTimes(4);
});

it('does not start in review or native background even with a visible document', async () => {
  const hook = mount(true, true); await tick(); expect(runtime.worker).not.toHaveBeenCalled();
  hook.rerender({ enabled: true, reviewing: false });
  act(() => runtime.background!()); await tick(); expect(runtime.worker).not.toHaveBeenCalled();
  act(() => runtime.foreground!()); await tick(29999); expect(runtime.worker).not.toHaveBeenCalled();
  await tick(1); expect(runtime.worker).toHaveBeenCalledTimes(2); hook.unmount();
});

it('requires fresh idle after a background/foreground roundtrip while inputs are loading', async () => {
  let resolve!: (value: typeof input) => void;
  runtime.input.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  const hook = mount(); await tick();
  act(() => { runtime.background!(); runtime.foreground!(); });
  resolve(input); await tick(0); expect(runtime.worker).not.toHaveBeenCalled();
  await tick(); expect(runtime.worker).toHaveBeenCalledTimes(2); hook.unmount();
});

it('lets fixed input finish during review or background and waits before starting the next folder', async () => {
  let finish!: (value: typeof model) => void;
  runtime.worker.mockImplementationOnce(() => new Promise(done => { finish = done; }));
  const hook = mount(); await tick();
  hook.rerender({ enabled: true, reviewing: true }); act(() => runtime.background!());
  finish(model); await tick(0); expect(runtime.save).toHaveBeenCalledTimes(1); expect(runtime.worker).toHaveBeenCalledTimes(1);
  hook.rerender({ enabled: true, reviewing: false }); act(() => runtime.foreground!());
  runtime.plan.mockResolvedValue({ folders: [{ folderId: 'child' }], libraryScope: 'scope' });
  await tick(); expect(runtime.worker).toHaveBeenCalledTimes(2); hook.unmount();
});

it('aborts on library replacement and unmount without saving a late worker result', async () => {
  let finish!: (value: typeof model) => void;
  runtime.worker.mockImplementationOnce(() => new Promise(done => { finish = done; }));
  const hook = mount(); await tick(); const signal = runtime.worker.mock.calls[0]![1] as AbortSignal;
  const scope = getCompanionReadingScope(); act(() => invalidateCompanionReadingScope());
  expect(getCompanionReadingScope()).not.toBe(scope); expect(signal.aborted).toBe(true);
  finish(model); await tick(0); expect(runtime.save).not.toHaveBeenCalled();
  hook.unmount(); await tick(90000); expect(runtime.worker).toHaveBeenCalledTimes(1);
});

it('ignores a stale startup foreground read after a native background event', async () => {
  let resolve!: (active: boolean) => void;
  runtime.active.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  const hook = mount(); await tick(0); act(() => runtime.background!());
  resolve(true); await tick(); expect(runtime.worker).not.toHaveBeenCalled();
  act(() => runtime.foreground!()); await tick(); expect(runtime.worker).toHaveBeenCalledTimes(2); hook.unmount();
});
