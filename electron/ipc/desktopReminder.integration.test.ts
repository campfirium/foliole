// @vitest-environment node
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { ReminderRule } from '../../lib/core/reminders/reminderRule.js';
import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
import { closeDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';
import { startDesktopReminders, stopDesktopReminders } from '../reminders/desktopReminderRuntime.js';

import { handleReminderCommand } from './reminderCommands.js';

const state = vi.hoisted(() => ({ root: '', show: vi.fn() }));
vi.mock('electron', () => ({
  app: { getPath: () => state.root },
  Notification: class {
    static isSupported() { return true; }
    constructor(private readonly options: { body: string }) {}
    once() {}
    show() { state.show(this.options.body); }
  }
}));
vi.mock('./paths.js', () => ({ resolveAppPaths: () => ({
  app_data_dir: state.root, app_config_dir: state.root,
  app_cache_dir: path.join(state.root, 'cache'), app_log_dir: path.join(state.root, 'logs')
}) }));

function save(message: string, time: string, enabled: boolean, previous?: ReminderRule) {
  return handleReminderCommand(NATIVE_COMMANDS.saveDesktopReminder, {
    message, time, enabled, ...(previous && { previous })
  }) as ReminderRule;
}

beforeEach(async () => {
  state.root = await mkdtemp(path.join(os.tmpdir(), 'foliole-desktop-reminders-'));
  initializeDatabase();
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 10, 10, 12, 0));
  state.show.mockClear();
});

afterEach(async () => {
  stopDesktopReminders();
  vi.useRealTimers();
  closeDatabaseConnection();
  await rm(state.root, { force: true, recursive: true });
});

it('reloads the enabled schedule, moves it on edit, repeats daily, and cancels on disable', async () => {
  const initial = save('Check Flow', '12:01', false);
  expect(handleReminderCommand(NATIVE_COMMANDS.loadDesktopReminders, {})).toEqual([initial]);
  const enabled = save(initial.message, '12:02', true, initial);
  stopDesktopReminders();
  closeDatabaseConnection();
  startDesktopReminders();
  expect(handleReminderCommand(NATIVE_COMMANDS.loadDesktopReminders, {})).toEqual([enabled]);
  const edited = save('Review notes', '12:03', true, enabled);
  await vi.advanceTimersByTimeAsync(120_000);
  expect(state.show).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(60_000);
  expect(state.show.mock.calls).toEqual([['Review notes']]);
  await vi.advanceTimersByTimeAsync(86_400_000);
  expect(state.show.mock.calls).toEqual([['Review notes'], ['Review notes']]);
  const disabled = save(edited.message, '12:03', false, edited);
  await vi.advanceTimersByTimeAsync(86_400_000);
  expect(state.show).toHaveBeenCalledTimes(2);
  expect(handleReminderCommand(NATIVE_COMMANDS.loadDesktopReminders, {})).toEqual([disabled]);
});

it('rejects invalid and stale mutations while keeping the current schedule', async () => {
  const initial = save('First', '12:01', true);
  expect(() => save('Invalid', '25:01', true, initial)).toThrow();
  const edited = save('Current', '12:01', true, initial);
  expect(() => save('Stale', '12:02', false, initial)).toThrow();
  expect(() => handleReminderCommand(NATIVE_COMMANDS.saveDesktopReminder, {
    message: 'Wrong shape', time: '12:01', enabled: 'true'
  })).toThrow();
  await vi.advanceTimersByTimeAsync(60_000);
  expect(state.show.mock.calls).toEqual([['Current']]);
  expect(handleReminderCommand(NATIVE_COMMANDS.loadDesktopReminders, {})).toEqual([edited]);
});
