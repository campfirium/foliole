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

it('keeps a replay save between earlier and later input instead of replacing it', async () => {
  const saved: string[] = [];
  const queue = createNodeContentPersistQueue({ delayMs: 0, isBlocked: () => false,
    persist: async (body: string) => { saved.push(body); return true; } });
  queue.schedule('topic', 'before');
  queue.schedule('topic', 'undone', { fixed: true });
  queue.schedule('topic', 'typed after undo');
  await queue.drain('topic');
  expect(saved).toEqual(['before', 'undone', 'typed after undo']);
});

it('confirms a fixed replay independently while subsequent input is still saving', async () => {
  let finishLater!: (saved: boolean) => void;
  const saved: string[] = [];
  const queue = createNodeContentPersistQueue({ delayMs: 0, isBlocked: () => false, persist: async (body: string) => {
    saved.push(body);
    return body === 'later' ? new Promise<boolean>(resolve => { finishLater = resolve; }) : true;
  } });
  const replay = queue.schedule('topic', 'replay', { fixed: true });
  queue.schedule('topic', 'later');
  await expect(replay.run()).resolves.toBe(true);
  const closing = queue.drain('topic');
  await vi.waitFor(() => expect(saved).toEqual(['replay', 'later']));
  finishLater(true);
  await expect(closing).resolves.toBe(true);
});

it('retains a failed replay and its successor for an explicit retry of the same commit', async () => {
  const persist = vi.fn<(body: string) => Promise<boolean>>().mockResolvedValueOnce(false).mockResolvedValue(true);
  const queue = createNodeContentPersistQueue({ delayMs: 0, isBlocked: () => false, persist });
  const replay = queue.schedule('topic', 'replay', { fixed: true });
  queue.schedule('topic', 'later');
  await expect(replay.run()).resolves.toBe(false);
  expect(persist.mock.calls).toEqual([['replay']]);
  await expect(replay.run()).resolves.toBe(true);
  await queue.drain('topic');
  expect(persist.mock.calls).toEqual([['replay'], ['replay'], ['later']]);
});

it('isolates the same node in a new library from an old in-flight save', async () => {
  let release!: (saved: boolean) => void;
  const oldSave = new Promise<boolean>(resolve => { release = resolve; });
  const persist = vi.fn<(value: { scope: string }) => Promise<boolean>>()
    .mockReturnValueOnce(oldSave).mockResolvedValue(true);
  const queue = createNodeContentPersistQueue({ delayMs: 0, isBlocked: () => false, persist, scope: value => value.scope });
  const old = queue.schedule('topic', { scope: 'old' }, { fixed: true });
  const oldReceipt = old.run();
  const next = queue.schedule('topic', { scope: 'new' }, { fixed: true });
  await expect(next.run()).resolves.toBe(true);
  release(true);
  await expect(oldReceipt).resolves.toBe(true);
  expect(persist.mock.calls).toEqual([[{ scope: 'old' }], [{ scope: 'new' }]]);
  expect(queue.nodeIds()).toEqual([]);
});
