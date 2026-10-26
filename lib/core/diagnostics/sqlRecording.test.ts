import { afterEach, expect, it, vi } from 'vitest';

import { SqlRecording } from './sqlRecording.js';

afterEach(() => { vi.useRealTimers(); });

it('performs no timing or collection until explicitly started', () => {
  const clock = vi.fn(() => 0);
  const recorder = new SqlRecording(clock);
  const result = { saved: true };
  expect(recorder.measure('SELECT * FROM notes', 'all', 'desktop', () => result)).toBe(result);
  expect(clock).not.toHaveBeenCalled();
  expect(recorder.snapshot()).toBeNull();
});

it('captures frequent and single expensive operations without retaining values or changing results/errors', () => {
  let now = 0;
  const recorder = new SqlRecording(() => now);
  recorder.start({ durationMs: 2000 });
  try {
    for (let i = 0; i < 40; i++) recorder.measure('SELECT * FROM notes WHERE id = ?', 'all', 'desktop', () => {
      now += 2; return [{ value: 'private-result' }];
    });
    recorder.mark('sort');
    recorder.measure('SELECT expensive_sort()', 'all', 'desktop', () => { now += 500; return []; });
    const error = new Error('private-error');
    expect(() => recorder.measure("UPDATE notes SET value='private--value' /* private-comment */", 'run', 'desktop',
      () => { throw error; })).toThrow(error);
    const report = recorder.stop()!;
    expect(report.groups.find(group => group.count === 40)).toMatchObject({ returnedRows: 40, totalMs: 80 });
    expect(report.groups[0]).toMatchObject({ maxMs: 500, label: 'sort' });
    expect(report.groups.find(group => group.errors)).toMatchObject({ errors: 1 });
    expect(JSON.stringify(report)).not.toMatch(/private-result|private-error|private--value|private-comment/u);
    expect(report.windows[0]).toMatchObject({ count: 42, totalMs: 580, maxMs: 500 });
  } finally { recorder.stop(); }
});

it('automatically stops, includes an in-flight slow operation, and excludes later operations', async () => {
  vi.useFakeTimers();
  const recorder = new SqlRecording(() => Date.now());
  recorder.start({ durationMs: 100 });
  let resolve!: (value: unknown[]) => void;
  const pending = recorder.measureAsync('SELECT slow()', 'query', 'android', () => new Promise(done => { resolve = done; }));
  await vi.advanceTimersByTimeAsync(150);
  expect(recorder.snapshot()).toMatchObject({ running: false, pending: 1 });
  expect(recorder.begin('SELECT excluded()', 'all', 'desktop')).toBeNull();
  resolve([{ id: 1 }]);
  await pending;
  expect(recorder.snapshot()!.groups).toEqual([expect.objectContaining({ count: 1, maxMs: 150, returnedRows: 1 })]);
  expect(recorder.snapshot()!.pending).toBe(0);
});

it('enforces the deadline even when synchronous work delays the timer and bounds group memory', () => {
  let now = 0;
  const recorder = new SqlRecording(() => now);
  recorder.start({ durationMs: 100, maxGroups: 1 });
  recorder.measure('SELECT a FROM notes', 'all', 'desktop', () => []);
  recorder.measure('SELECT b FROM notes', 'all', 'desktop', () => []);
  now = 200;
  expect(recorder.begin('SELECT later FROM notes', 'all', 'desktop')).toBeNull();
  expect(recorder.snapshot()).toMatchObject({ running: false, overflowOperations: 1, durationMs: 100 });
  expect(recorder.snapshot()!.groups).toHaveLength(1);
  expect(() => recorder.start({ durationMs: Infinity })).toThrow();
});

it('keeps completed evidence immutable to callers and ignores export failures', () => {
  const recorder = new SqlRecording();
  recorder.start();
  recorder.measure('SELECT 1', 'get', 'desktop', () => ({ id: 1 }));
  recorder.onStopped = () => { throw new Error('export unavailable'); };
  const report = recorder.stop()!;
  report.groups[0]!.count = 999;
  expect(recorder.snapshot()!.groups[0]!.count).toBe(1);
});
