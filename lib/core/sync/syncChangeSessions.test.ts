import { randomUUID } from 'node:crypto';

import { afterEach, expect, it, vi } from 'vitest';

import { createSyncChangeSessions } from './syncChangeSessions.js';

afterEach(() => vi.useRealTimers());

it('does not consume a desktop edit between the final inventory and finish confirmation', async () => {
  const sessions = createSyncChangeSessions(randomUUID(), randomUUID);
  const beforeRound = sessions.open('phone');
  sessions.changed(beforeRound.session);
  // The inventory has finished; a local edit commits before round_finish.
  sessions.changed();
  sessions.changed(beforeRound.session);
  const result = await sessions.wait('phone', beforeRound.session, beforeRound.marker, new AbortController().signal);
  expect(result.changed).toBe(true);
  expect(result.marker.sequence).toBe(3);
  sessions.closeAll();
});

it('ignores only the authenticated source session and wakes other sessions', async () => {
  vi.useFakeTimers();
  const sessions = createSyncChangeSessions(randomUUID(), randomUUID);
  const a = sessions.open('a');
  const b = sessions.open('b');
  expect(() => sessions.signal('b', a.session)).toThrow('sync_session_expired');
  sessions.changed(a.session);
  expect((await sessions.wait('b', b.session, b.marker, new AbortController().signal)).changed).toBe(true);
  const own = sessions.wait('a', a.session, a.marker, new AbortController().signal);
  await vi.advanceTimersByTimeAsync(20_000);
  expect((await own).changed).toBe(false);
  sessions.closeAll();
});

it('invalidates old session requests and cancels pending waits on replacement and shutdown', async () => {
  const sessions = createSyncChangeSessions(randomUUID(), randomUUID);
  const first = sessions.open('phone');
  const pending = sessions.wait('phone', first.session, first.marker, new AbortController().signal);
  const rejected = expect(pending).rejects.toThrow('sync_session_expired');
  const second = sessions.open('phone');
  await rejected;
  expect(() => sessions.signal('phone', first.session)).toThrow('sync_session_expired');
  const stopped = expect(sessions.wait('phone', second.session, second.marker, new AbortController().signal))
    .rejects.toThrow('sync_session_expired');
  sessions.closeAll();
  await stopped;
});

it('immediately reconciles a marker from a previous server instance', async () => {
  const sessions = createSyncChangeSessions(randomUUID(), randomUUID);
  const session = sessions.open('phone');
  const reply = await sessions.wait('phone', session.session, { instance: randomUUID(), sequence: 900 },
    new AbortController().signal);
  expect(reply.changed).toBe(true);
  sessions.closeAll();
});

it('finishes a desktop manual request only after a covering successful phone round', async () => {
  const sessions = createSyncChangeSessions(randomUUID(), randomUUID);
  const session = sessions.open('phone');
  let completed = false;
  const manual = sessions.requestSync().then(result => { completed = result; return result; });
  sessions.complete('phone', session.session, session.marker);
  await Promise.resolve();
  expect(completed).toBe(false);
  const next = await sessions.wait('phone', session.session, session.marker, new AbortController().signal);
  expect(next.changed).toBe(true);
  sessions.complete('phone', session.session, next.marker);
  await expect(manual).resolves.toBe(true);
  sessions.closeAll();
});

it('expires abandoned sessions and cancels their manual demand without claiming completion', async () => {
  vi.useFakeTimers();
  const sessions = createSyncChangeSessions(randomUUID(), randomUUID);
  const session = sessions.open('phone');
  const manual = sessions.requestSync();
  await vi.advanceTimersByTimeAsync(60_000);
  await expect(manual).resolves.toBe(false);
  expect(() => sessions.signal('phone', session.session)).toThrow('sync_session_expired');
});

it('ends manual waiting within 30 seconds even while the phone keeps its session alive', async () => {
  vi.useFakeTimers();
  const sessions = createSyncChangeSessions(randomUUID(), randomUUID);
  const session = sessions.open('phone');
  let result: boolean | undefined;
  const manual = sessions.requestSync().then(value => { result = value; });
  for (let elapsed = 0; elapsed < 30_000; elapsed += 10_000) {
    await vi.advanceTimersByTimeAsync(10_000);
    sessions.signal('phone', session.session);
  }
  expect(result).toBe(false);
  await manual;
  expect(sessions.hasSessions()).toBe(true);
  const retry = sessions.requestSync();
  const observed = await sessions.wait('phone', session.session, session.marker, new AbortController().signal);
  sessions.complete('phone', session.session, observed.marker);
  await expect(retry).resolves.toBe(true);
  sessions.closeAll();
  expect(vi.getTimerCount()).toBe(0);
});
