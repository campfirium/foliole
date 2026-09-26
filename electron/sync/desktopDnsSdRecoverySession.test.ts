import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({
  sessions: [] as Array<{
    callbacks: {
      onError(error: Error): void;
      onService(event: { kind: 'found'; service: never }): void;
    };
    stop: ReturnType<typeof vi.fn>;
  }>
}));

vi.mock('./desktopDnsSd.js', () => ({
  startDesktopDnsSdSession: (callbacks: typeof native.sessions[number]['callbacks']) => {
    const session = { callbacks, stop: vi.fn() };
    native.sessions.push(session);
    return session;
  }
}));

import { startRecoverableDesktopDnsSdSession } from './desktopDnsSdRecoverySession.js';

beforeEach(() => {
  vi.useFakeTimers();
  native.sessions = [];
});

afterEach(() => vi.useRealTimers());

it('rebuilds failed browse sessions with bounded delays and ignores old callbacks', () => {
  const onError = vi.fn();
  const onService = vi.fn();
  const session = startRecoverableDesktopDnsSdSession({ onError, onService });
  const first = native.sessions[0]!;
  first.callbacks.onError(new Error('browse failed'));
  expect(first.stop).toHaveBeenCalledOnce();
  vi.advanceTimersByTime(999);
  expect(native.sessions).toHaveLength(1);
  vi.advanceTimersByTime(1);
  expect(native.sessions).toHaveLength(2);
  first.callbacks.onService({ kind: 'found', service: {} as never });
  expect(onService).not.toHaveBeenCalled();

  native.sessions[1]!.callbacks.onError(new Error('browse failed'));
  vi.advanceTimersByTime(3_000);
  native.sessions[2]!.callbacks.onError(new Error('browse failed'));
  vi.advanceTimersByTime(10_000);
  native.sessions[3]!.callbacks.onError(new Error('browse failed'));
  vi.advanceTimersByTime(30_000);
  expect(native.sessions).toHaveLength(4);
  expect(onError).toHaveBeenCalledTimes(4);

  session.recover();
  expect(native.sessions).toHaveLength(5);
  native.sessions[4]!.callbacks.onService({ kind: 'found', service: {} as never });
  expect(onService).toHaveBeenCalledOnce();
  session.stop();
});

it('cancels pending recovery when stopped and resets the retry budget after stability', () => {
  const session = startRecoverableDesktopDnsSdSession({ onError: vi.fn(), onService: vi.fn() });
  vi.advanceTimersByTime(30_000);
  native.sessions[0]!.callbacks.onError(new Error('late browse failure'));
  vi.advanceTimersByTime(1_000);
  expect(native.sessions).toHaveLength(2);
  native.sessions[1]!.callbacks.onError(new Error('browse failure'));
  session.stop();
  vi.advanceTimersByTime(30_000);
  expect(native.sessions).toHaveLength(2);
});
