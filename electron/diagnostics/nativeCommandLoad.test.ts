// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';

const { appendDiagnosticLog } = vi.hoisted(() => ({ appendDiagnosticLog: vi.fn(() => Promise.resolve()) }));
vi.mock('./diagnosticLog.js', () => ({ appendDiagnosticLog }));

import {
  formatNativeCommandLoad,
  NATIVE_COMMAND_HOT_CALLS_PER_HOUR,
  NATIVE_COMMAND_SLOW_MS,
  readNativeCommandLoad,
  recordNativeCommandTiming,
  resetNativeCommandLoadForTests
} from './nativeCommandLoad.js';

const HOUR = Date.parse('2026-11-22T10:00:00.000Z');

afterEach(() => {
  resetNativeCommandLoadForTests();
  appendDiagnosticLog.mockClear();
});

function loggedEvents() {
  return appendDiagnosticLog.mock.calls.map(([record]) => record as { event: string; payload: Record<string, unknown> });
}

it('keeps calls, failures, total and longest time per command within the hour', () => {
  recordNativeCommandTiming('load_daily_flow_view', 12.4, 'done', HOUR + 1000);
  recordNativeCommandTiming('load_daily_flow_view', 30, 'failed', HOUR + 2000);
  recordNativeCommandTiming('save_node_open_state', 3, 'done', HOUR + 3000);
  const [hour] = readNativeCommandLoad();
  expect(hour).toMatchObject({ hourStart: '2026-11-22T10:00:00.000Z', calls: 3, totalMs: 45 });
  expect(hour!.top[0]).toEqual({ command: 'load_daily_flow_view', calls: 2, failures: 1, totalMs: 42, maxMs: 30 });
  expect(loggedEvents()).toEqual([]);
});

it('logs a slow command at once but only once a minute per command', () => {
  recordNativeCommandTiming('move_nodes', NATIVE_COMMAND_SLOW_MS, 'done', HOUR);
  recordNativeCommandTiming('move_nodes', NATIVE_COMMAND_SLOW_MS + 100, 'done', HOUR + 30_000);
  recordNativeCommandTiming('move_nodes', NATIVE_COMMAND_SLOW_MS - 1, 'done', HOUR + 90_000);
  recordNativeCommandTiming('move_nodes', NATIVE_COMMAND_SLOW_MS + 5, 'failed', HOUR + 61_000);
  expect(loggedEvents()).toEqual([
    expect.objectContaining({ event: 'native_command_slow', payload: { command: 'move_nodes', durationMs: 500, status: 'done' } }),
    expect.objectContaining({ event: 'native_command_slow', payload: { command: 'move_nodes', durationMs: 505, status: 'failed' } })
  ]);
});

it('reports a command called often enough to burn CPU once its hour closes, though no call was slow', () => {
  for (let index = 0; index < NATIVE_COMMAND_HOT_CALLS_PER_HOUR; index++) {
    recordNativeCommandTiming('load_daily_flow_view', 2, 'done', HOUR + index);
  }
  recordNativeCommandTiming('save_node_open_state', 2, 'done', HOUR + 10);
  expect(loggedEvents()).toEqual([]);
  recordNativeCommandTiming('save_node_open_state', 2, 'done', HOUR + 3_600_000);
  recordNativeCommandTiming('save_node_open_state', 2, 'done', HOUR + 7_200_000);
  expect(loggedEvents()).toEqual([expect.objectContaining({
    event: 'native_command_hot', occurred_at: '2026-11-22T10:00:00.000Z',
    payload: { command: 'load_daily_flow_view', calls: NATIVE_COMMAND_HOT_CALLS_PER_HOUR, failures: 0,
      totalMs: 2 * NATIVE_COMMAND_HOT_CALLS_PER_HOUR, maxMs: 2 }
  })]);
  expect(formatNativeCommandLoad()).toContain(`load_daily_flow_view: ${NATIVE_COMMAND_HOT_CALLS_PER_HOUR} calls`);
});

it('keeps only command names, cut to a bounded length', () => {
  recordNativeCommandTiming('x'.repeat(500), 1, 'done', HOUR);
  expect(readNativeCommandLoad()[0]!.top[0]!.command).toHaveLength(80);
  expect(formatNativeCommandLoad([])).toBe('- No native commands timed in this session yet.');
});
