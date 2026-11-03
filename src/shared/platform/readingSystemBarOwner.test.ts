import { expect, it, vi } from 'vitest';

import { ReadingSystemBarOwner } from './readingSystemBarOwner';

const state = (hidden: boolean) => ({ enabled: hidden, hidden });

it('restores the bar after a delayed hide completes following exit', async () => {
  let release!: () => void;
  const hold = new Promise<void>(resolve => { release = resolve; });
  const apply = vi.fn((target: { hidden: boolean }) => target.hidden ? hold : Promise.resolve());
  const owner = new ReadingSystemBarOwner(apply);
  const pending = owner.request(state(true));
  await Promise.resolve();
  void owner.request(state(false));
  await Promise.resolve();
  expect(apply.mock.calls).toEqual([[state(true)]]);
  await Promise.resolve(); release(); await pending;
  expect(apply.mock.calls).toEqual([[state(true)], [state(false)]]);
  expect(owner.getError()).toBe(false);
});

it('coalesces overlapping foreground events but reapplies a later real foreground', async () => {
  let release!: () => void;
  const apply = vi.fn(() => new Promise<void>(resolve => { release = resolve; }));
  const owner = new ReadingSystemBarOwner(apply);
  const pending = owner.request(state(true));
  void owner.request(state(true), true);
  void owner.request(state(true), true);
  await Promise.resolve(); release(); await pending;
  expect(apply).toHaveBeenCalledTimes(1);
  const resumed = owner.request(state(true), true);
  await Promise.resolve(); release(); await resumed;
  expect(apply).toHaveBeenCalledTimes(2);
});

it('retries a failed latest target and does not confuse a stale failure with the current screen', async () => {
  const apply = vi.fn(async (hidden: { enabled: boolean; hidden: boolean }) => { void hidden; });
  apply.mockRejectedValueOnce(new Error('host failure'));
  const owner = new ReadingSystemBarOwner(apply);
  await owner.request(state(true));
  expect(owner.getError()).toBe(true);
  await owner.retry();
  expect(owner.getError()).toBe(false);
  expect(apply.mock.calls).toEqual([[state(true)], [state(true)]]);
  let reject!: (error: Error) => void;
  apply.mockImplementationOnce(() => new Promise((_resolve, rejectPromise) => { reject = rejectPromise; }));
  const pending = owner.request(state(true), true);
  await Promise.resolve();
  void owner.request(state(false));
  await Promise.resolve(); reject(new Error('old screen'));
  await pending;
  expect(owner.getError()).toBe(false);
  expect(apply).toHaveBeenLastCalledWith(state(false));
});


it('coalesces a same-turn reader handoff before changing the actual window', async () => {
  const apply = vi.fn(async (value: { enabled: boolean; hidden: boolean }) => { void value; });
  const owner = new ReadingSystemBarOwner(apply);
  const pending = owner.request(state(true));
  void owner.request(state(false));
  void owner.request({ enabled: true, hidden: false });
  await pending;
  expect(apply.mock.calls).toEqual([[{ enabled: true, hidden: false }]]);
});
