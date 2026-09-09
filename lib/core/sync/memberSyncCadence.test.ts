import { afterEach, expect, it, vi } from 'vitest';

import {
  createMemberSyncCadence,
  MEMBER_SYNC_FRESHNESS_MS,
  MEMBER_SYNC_TRAILING_WINDOW_MS
} from './memberSyncCadence.js';

function deferred() {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

afterEach(() => vi.useRealTimers());

it('runs the leading mutation immediately and merges a burst into one trailing run', async () => {
  vi.useFakeTimers();
  const run = vi.fn<(input: string) => Promise<void>>(async () => undefined);
  const cadence = createMemberSyncCadence({ run });
  cadence.updateFreshness({ eligible: true, input: 'freshness' });

  cadence.requestMutation('first');
  await vi.advanceTimersByTimeAsync(1_000);
  cadence.requestMutation('second');
  cadence.requestMutation('third');
  await vi.advanceTimersByTimeAsync(MEMBER_SYNC_TRAILING_WINDOW_MS - 1_000);

  expect(run.mock.calls.map(([input]) => input)).toEqual(['first', 'third']);
});

it('does not create a trailing run without a later mutation', async () => {
  vi.useFakeTimers();
  const run = vi.fn<(input: string) => Promise<void>>(async () => undefined);
  const cadence = createMemberSyncCadence({ run });
  cadence.updateFreshness({ eligible: true, input: 'freshness' });
  cadence.requestMutation('only');

  await vi.advanceTimersByTimeAsync(MEMBER_SYNC_TRAILING_WINDOW_MS);
  expect(run).toHaveBeenCalledOnce();
});

it('waits for a long active run before starting the single trailing run', async () => {
  vi.useFakeTimers();
  const first = deferred();
  const run = vi.fn<(input: string) => Promise<void>>(async () => undefined)
    .mockReturnValueOnce(first.promise).mockResolvedValue(undefined);
  const cadence = createMemberSyncCadence({ run });
  cadence.updateFreshness({ eligible: true, input: 'freshness' });
  cadence.requestMutation('first');
  cadence.requestMutation('later');

  await vi.advanceTimersByTimeAsync(MEMBER_SYNC_TRAILING_WINDOW_MS * 2);
  expect(run).toHaveBeenCalledOnce();
  first.resolve();
  await vi.advanceTimersByTimeAsync(0);
  expect(run.mock.calls.map(([input]) => input)).toEqual(['first', 'later']);
});

it('joins an external manual run and trails a mutation after it', async () => {
  vi.useFakeTimers();
  const manual = deferred();
  let external: Promise<void> | null = manual.promise;
  const run = vi.fn<(input: string) => Promise<void>>(async () => undefined);
  const cadence = createMemberSyncCadence({ getActiveRun: () => external, run });
  cadence.updateFreshness({ eligible: true, input: 'freshness' });

  expect(cadence.requestImmediate('foreground')).toBe(manual.promise);
  cadence.requestMutation('mutation');
  await vi.advanceTimersByTimeAsync(MEMBER_SYNC_TRAILING_WINDOW_MS);
  expect(run).not.toHaveBeenCalled();
  external = null;
  manual.resolve();
  await vi.runOnlyPendingTimersAsync();
  expect(run).toHaveBeenCalledWith('mutation');
});

it('runs freshness once per minute only while eligible', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(10_000);
  const run = vi.fn<(input: string) => Promise<void>>(async () => undefined);
  const cadence = createMemberSyncCadence({ run });
  cadence.updateFreshness({ eligible: true, input: 'freshness', lastActualSyncAt: 10_000 });

  await vi.advanceTimersByTimeAsync(MEMBER_SYNC_FRESHNESS_MS);
  expect(run).toHaveBeenCalledWith('freshness');
  cadence.updateFreshness({ eligible: false, input: null });
  await vi.advanceTimersByTimeAsync(MEMBER_SYNC_FRESHNESS_MS * 2);
  expect(run).toHaveBeenCalledOnce();
});
