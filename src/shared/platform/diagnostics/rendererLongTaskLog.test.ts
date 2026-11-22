import { afterEach, expect, it, vi } from 'vitest';

const { logRuntimeEvent } = vi.hoisted(() => ({ logRuntimeEvent: vi.fn() }));
vi.mock('../runtimeLogging', () => ({ logRuntimeEvent }));

import {
  flushRendererLongTaskHour,
  installRendererLongTaskLog,
  recordRendererLongTask,
  resetRendererLongTaskLogForTests
} from './rendererLongTaskLog';

const HOUR = Date.parse('2026-11-22T10:00:00.000Z');

afterEach(() => {
  resetRendererLongTaskLogForTests();
  logRuntimeEvent.mockClear();
});

it('summarizes an hour of steady long tasks once the hour closes, though none was slow on its own', () => {
  for (let index = 0; index < 30; index++) recordRendererLongTask(80, HOUR + index * 1000);
  expect(logRuntimeEvent).not.toHaveBeenCalled();
  recordRendererLongTask(60, HOUR + 3_600_000);
  expect(logRuntimeEvent).toHaveBeenCalledTimes(1);
  expect(logRuntimeEvent).toHaveBeenCalledWith(expect.objectContaining({ event: 'renderer_long_tasks', level: 'info',
    occurredAt: '2026-11-22T10:00:00.000Z', payload: { count: 30, totalMs: 2400, maxMs: 80 } }));
});

it('skips the summary of a quiet hour', () => {
  recordRendererLongTask(120, HOUR);
  flushRendererLongTaskHour();
  expect(logRuntimeEvent).not.toHaveBeenCalled();
});

it('logs a single task of a second or more at once, at most once a minute', () => {
  recordRendererLongTask(1000, HOUR);
  recordRendererLongTask(1500, HOUR + 30_000);
  recordRendererLongTask(1200, HOUR + 60_000);
  expect(logRuntimeEvent.mock.calls.map(([record]) => (record as { payload: unknown }).payload))
    .toEqual([{ durationMs: 1000 }, { durationMs: 1200 }]);
});

it('observes nothing without the desktop diagnostic log', () => {
  const observe = vi.fn();
  vi.stubGlobal('PerformanceObserver', Object.assign(vi.fn(() => ({ observe, disconnect: vi.fn() })),
    { supportedEntryTypes: ['longtask'] }));
  try {
    installRendererLongTaskLog()();
    expect(observe).not.toHaveBeenCalled();
  } finally {
    vi.unstubAllGlobals();
  }
});
