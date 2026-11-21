// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { correlateBootEvents, parseEvents } from './boot-log-correlation.mjs';

const line = (stage, timestamp, payload) => JSON.stringify({ stage, timestamp, payload });

const LOG = [
  line('desktop_task_started', 't1', { id: 1, label: 'pdf-index' }),
  line('desktop_task_started', 't2', { id: 2, label: 'backup' }),
  line('app_responsive', 't3', { driftMs: 2500 }),
  'not json',
  line('desktop_task_completed', 't4', { id: 2, label: 'backup', durationMs: 900 }),
  line('app_responsive', 't5', { driftMs: 400 }),
  line('app_responsive', 't6', { driftMs: 1200 }),
  line('desktop_task_failed', 't7', { id: 1, label: 'pdf-index', durationMs: 4000 }),
  line('desktop_task_started', 't8', { id: 3, label: 'backup' }),
  line('desktop_task_cancelled', 't9', { id: 3, label: 'backup', durationMs: 1500 }),
  ''
].join('\n');

describe('boot log correlation', () => {
  it('pairs each stall above the threshold with the tasks running at that moment', () => {
    const result = correlateBootEvents(parseEvents(LOG));
    expect(result.eventCount).toBe(9);
    expect(result.lastAt).toBe('t9');
    expect(result.stalls).toEqual([
      { at: 't3', driftMs: 2500, running: 'pdf-index | backup' },
      { at: 't6', driftMs: 1200, running: 'pdf-index' }
    ]);
  });

  it('keeps the longest run per task label across completed, failed and cancelled runs', () => {
    expect(correlateBootEvents(parseEvents(LOG)).tasks).toEqual([
      { label: 'pdf-index', runs: 1, maxMs: 4000 },
      { label: 'backup', runs: 2, maxMs: 1500 }
    ]);
  });

  it('honours a lower drift threshold and reports an empty log', () => {
    expect(correlateBootEvents(parseEvents(LOG), { minDriftMs: 300 }).stalls).toHaveLength(3);
    expect(correlateBootEvents(parseEvents(''))).toEqual({ eventCount: 0, lastAt: 'none', stalls: [], tasks: [] });
  });
});
