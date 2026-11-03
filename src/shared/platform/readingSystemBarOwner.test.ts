import { expect, it, vi } from 'vitest';

import { ReadingSystemBarOwner } from './readingSystemBarOwner';

it('restores the bar after a delayed hide completes following exit', async () => {
  let release!: () => void;
  const hold = new Promise<void>(resolve => { release = resolve; });
  const apply = vi.fn((hidden: boolean) => hidden ? hold : Promise.resolve());
  const owner = new ReadingSystemBarOwner(apply);
  const pending = owner.request(true);
  void owner.request(false);
  expect(apply.mock.calls).toEqual([[true]]);
  release(); await pending;
  expect(apply.mock.calls).toEqual([[true], [false]]);
  expect(owner.getError()).toBe(false);
});

it('coalesces overlapping foreground events but reapplies a later real foreground', async () => {
  let release!: () => void;
  const apply = vi.fn(() => new Promise<void>(resolve => { release = resolve; }));
  const owner = new ReadingSystemBarOwner(apply);
  const pending = owner.request(true);
  void owner.request(true, true);
  void owner.request(true, true);
  release(); await pending;
  expect(apply).toHaveBeenCalledTimes(1);
  const resumed = owner.request(true, true);
  release(); await resumed;
  expect(apply).toHaveBeenCalledTimes(2);
});

it('retries a failed latest target and does not confuse a stale failure with the current screen', async () => {
  const apply = vi.fn(async (hidden: boolean) => { void hidden; });
  apply.mockRejectedValueOnce(new Error('host failure'));
  const owner = new ReadingSystemBarOwner(apply);
  await owner.request(true);
  expect(owner.getError()).toBe(true);
  await owner.retry();
  expect(owner.getError()).toBe(false);
  expect(apply.mock.calls).toEqual([[true], [true]]);
  let reject!: (error: Error) => void;
  apply.mockImplementationOnce(() => new Promise((_resolve, rejectPromise) => { reject = rejectPromise; }));
  const pending = owner.request(true, true);
  void owner.request(false);
  reject(new Error('old screen'));
  await pending;
  expect(owner.getError()).toBe(false);
  expect(apply).toHaveBeenLastCalledWith(false);
});
