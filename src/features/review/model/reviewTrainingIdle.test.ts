import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { startReviewTrainingIdle, REVIEW_TRAINING_IDLE_MS } from './reviewTrainingIdle';
import { getReviewTrainingSession, optimizeReadyReviewFolders, setReviewTrainingStudyActive } from './reviewTrainingSession';

const runtime = vi.hoisted(() => ({ plan: vi.fn(), input: vi.fn(), save: vi.fn(), worker: vi.fn() }));
vi.mock('../../../shared/platform/desktop/reviewTrainingRuntimeRepository', () => ({
  loadReviewTrainingPlan: runtime.plan, loadReviewTrainingInput: runtime.input, saveReviewTrainingModel: runtime.save
}));
vi.mock('./reviewTrainingWorkerClient', () => ({ runReviewTrainingWorker: runtime.worker }));

let idle: ReturnType<typeof startReviewTrainingIdle>;
let visible = true;
const input = { folderId: null, events: [{ opId: 'fixed' }] };
const model = { folderId: null, trainedAt: '2026-10-26T08:00:00Z' };
const tick = () => vi.advanceTimersByTimeAsync(REVIEW_TRAINING_IDLE_MS);

beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks(); visible = true;
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visible ? 'visible' : 'hidden');
  setReviewTrainingStudyActive(false);
  runtime.plan.mockResolvedValue({ folders: [{ folderId: null }, { folderId: 'child' }], libraryScope: 'scope', lastTrainedAt: null });
  runtime.input.mockResolvedValue(input); runtime.worker.mockResolvedValue(model); runtime.save.mockResolvedValue(undefined);
  idle = startReviewTrainingIdle();
});
afterEach(() => { idle.dispose(); vi.useRealTimers(); vi.restoreAllMocks(); });

it('starts without a button after uninterrupted foreground idle and does not poll afterward', async () => {
  await vi.advanceTimersByTimeAsync(REVIEW_TRAINING_IDLE_MS - 1);
  expect(runtime.plan).not.toHaveBeenCalled();
  window.dispatchEvent(new Event('pointerdown'));
  await vi.advanceTimersByTimeAsync(REVIEW_TRAINING_IDLE_MS - 1);
  expect(runtime.plan).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(runtime.input.mock.calls.map(call => call[0])).toEqual([null, 'child']);
  expect(runtime.worker).toHaveBeenCalledTimes(2);
  expect(runtime.save).toHaveBeenLastCalledWith(model, 'scope');
  await tick(); await tick();
  expect(runtime.plan).toHaveBeenCalledTimes(1);
  idle.wake(); await tick();
  expect(runtime.plan).toHaveBeenCalledTimes(2);
});

it('waits for foreground and leaving study before starting', async () => {
  visible = false; document.dispatchEvent(new Event('visibilitychange'));
  await tick(); expect(runtime.plan).not.toHaveBeenCalled();
  visible = true; document.dispatchEvent(new Event('visibilitychange'));
  setReviewTrainingStudyActive(true);
  await tick(); expect(runtime.plan).not.toHaveBeenCalled();
  setReviewTrainingStudyActive(false);
  await tick(); expect(runtime.worker).toHaveBeenCalledTimes(2);
});

it.each(['study', 'hidden', 'activity'])('rechecks %s after asynchronous input loading before creating a Worker', async reason => {
  let resolve!: (value: typeof input) => void;
  runtime.input.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  await tick(); expect(runtime.input).toHaveBeenCalledTimes(1);
  if (reason === 'study') setReviewTrainingStudyActive(true);
  if (reason === 'hidden') { visible = false; document.dispatchEvent(new Event('visibilitychange')); }
  if (reason === 'activity') window.dispatchEvent(new Event('keydown'));
  resolve(input); await vi.advanceTimersByTimeAsync(0);
  expect(runtime.worker).not.toHaveBeenCalled();
  expect(getReviewTrainingSession().running).toBe(false);
});

it('allows the active fixed-input Worker to finish in study but defers the next folder', async () => {
  let finish!: (value: typeof model) => void;
  runtime.worker.mockImplementationOnce(() => new Promise(done => { finish = done; }));
  await tick();
  setReviewTrainingStudyActive(true); idle.wake(); idle.wake();
  await optimizeReadyReviewFolders();
  expect(runtime.worker).toHaveBeenCalledTimes(1);
  expect(runtime.worker.mock.calls[0]![0]).toBe(input);
  expect(runtime.worker.mock.calls[0]![1].aborted).toBe(false);
  finish(model); await vi.advanceTimersByTimeAsync(0);
  expect(runtime.save).toHaveBeenCalledWith(model, 'scope');
  expect(runtime.input).toHaveBeenCalledTimes(1);
  runtime.plan.mockResolvedValue({ folders: [{ folderId: 'child' }], libraryScope: 'scope', lastTrainedAt: model.trainedAt });
  setReviewTrainingStudyActive(false); await tick();
  expect(runtime.input).toHaveBeenLastCalledWith('child', 'scope');
});

it('disposes listeners and timers and aborts the active automatic Worker', async () => {
  runtime.worker.mockImplementation((_input, signal: AbortSignal) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new Error('cancelled')), { once: true });
  }));
  await tick(); idle.dispose(); await vi.advanceTimersByTimeAsync(0);
  expect(runtime.worker.mock.calls[0]![1].aborted).toBe(true);
  expect(getReviewTrainingSession().running).toBe(false);
  window.dispatchEvent(new Event('keydown')); idle.wake(); await tick();
  expect(runtime.plan).toHaveBeenCalledTimes(1);
  expect(runtime.save).not.toHaveBeenCalled();
});
