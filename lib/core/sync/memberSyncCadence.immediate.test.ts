import { afterEach, expect, it, vi } from 'vitest';

import { createMemberSyncCadence } from './memberSyncCadence.js';

afterEach(() => vi.useRealTimers());

it.each([100, 500, 2500, 4900])('starts a saved mutation after %i ms without another idle window', async delay => {
  vi.useFakeTimers();
  const run = vi.fn<(input: string) => Promise<void>>(async () => undefined);
  const cadence = createMemberSyncCadence({ run });
  cadence.updateFreshness({ eligible: true, input: 'freshness' });
  await cadence.requestMutation('first');
  await vi.advanceTimersByTimeAsync(delay);
  await cadence.requestMutation('second');
  expect(run.mock.calls.map(([input]) => input)).toEqual(['first', 'second']);
  cadence.stop();
});

it('retains new input during a run and starts it as soon as ownership is released', async () => {
  vi.useFakeTimers();
  let release = () => {};
  const first = new Promise<void>(resolve => { release = resolve; });
  const run = vi.fn<(input: string) => Promise<void>>().mockReturnValueOnce(first).mockResolvedValue(undefined);
  const cadence = createMemberSyncCadence({ run });
  cadence.updateFreshness({ eligible: true, input: 'freshness' });
  cadence.requestMutation('first');
  await vi.advanceTimersByTimeAsync(100);
  cadence.requestMutation('intermediate');
  cadence.requestMutation('latest');
  expect(run).toHaveBeenCalledTimes(1);
  release();
  await vi.advanceTimersByTimeAsync(0);
  expect(run.mock.calls.map(([input]) => input)).toEqual(['first', 'latest']);
  cadence.stop();
});
