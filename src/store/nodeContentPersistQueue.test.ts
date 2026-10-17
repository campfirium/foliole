import { afterEach, expect, it, vi } from 'vitest';

import { createNodeContentPersistQueue } from './nodeContentPersistQueue';

afterEach(() => vi.useRealTimers());

it('holds an outdated pending snapshot until the buffered input is delivered', async () => {
  vi.useFakeTimers();
  const persist = vi.fn<(body: string) => Promise<boolean>>(async () => true);
  const queue = createNodeContentPersistQueue({ delayMs: 0, isBlocked: () => false, persist });
  queue.schedule('topic', 'old');
  queue.defer('topic');
  await vi.advanceTimersByTimeAsync(10_000);
  expect(persist).not.toHaveBeenCalled();
  queue.schedule('topic', 'latest');
  await vi.advanceTimersByTimeAsync(0);
  expect(persist.mock.calls).toEqual([['latest']]);
});

it('keeps buffered input protection after an in-flight write releases', async () => {
  vi.useFakeTimers();
  let release: (accepted: boolean) => void = () => {};
  const active = new Promise<boolean>(resolve => { release = resolve; });
  const persist = vi.fn<(body: string) => Promise<boolean>>().mockReturnValueOnce(active).mockResolvedValue(true);
  const queue = createNodeContentPersistQueue({ delayMs: 0, isBlocked: () => false, persist });
  queue.schedule('topic', 'first');
  await vi.advanceTimersByTimeAsync(0);
  queue.schedule('topic', 'outdated');
  await vi.advanceTimersByTimeAsync(0);
  queue.defer('topic');
  release(true);
  await vi.advanceTimersByTimeAsync(10_000);
  expect(persist.mock.calls).toEqual([['first']]);
  queue.schedule('topic', 'latest');
  await vi.advanceTimersByTimeAsync(0);
  expect(persist.mock.calls).toEqual([['first'], ['latest']]);
});

it('allows an explicit close drain to save a buffered snapshot', async () => {
  const persist = vi.fn<(body: string) => Promise<boolean>>(async () => true);
  const queue = createNodeContentPersistQueue({ delayMs: 0, isBlocked: () => false, persist });
  queue.schedule('topic', 'pending');
  queue.defer('topic');
  await expect(queue.drain('topic')).resolves.toBe(true);
  expect(persist.mock.calls).toEqual([['pending']]);
});
