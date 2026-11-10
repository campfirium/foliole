// @vitest-environment node
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { app, powerMonitor } from 'electron';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { ReminderRule } from '../../lib/core/reminders/reminderRule.js';
import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
import { DESKTOP_REMINDER_OPEN_DIVE_PREFIX, DESKTOP_REMINDER_OPEN_FLOW } from '../../lib/platform/nativeReminderContract.js';
import { closeDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';
import { installDesktopReminderNavigation } from '../reminders/desktopReminderNavigation.js';
import { startDesktopReminders, stopDesktopReminders } from '../reminders/desktopReminderRuntime.js';

import { IPC_MENU_EVENT_CHANNEL } from './contracts.js';
import { handleReminderCommand } from './reminderCommands.js';

const state = vi.hoisted(() => ({ root: '', focused: false, show: vi.fn(), click: new Map<string, () => void>() }));
vi.mock('electron', async () => {
  const { EventEmitter } = await import('node:events');
  return {
  app: Object.assign(new EventEmitter(), { getPath: () => state.root }),
  BrowserWindow: { getFocusedWindow: () => state.focused ? {} : null },
  powerMonitor: new EventEmitter(),
  Notification: class {
    static isSupported() { return true; }
    constructor(private readonly options: { body: string }) {}
    once(event: string, handler: () => void) {
      if (event === 'click') state.click.set(this.options.body, handler);
    }
    show() { state.show(this.options.body); }
  }
  };
});
vi.mock('./boot.js', async importOriginal => ({
  ...await importOriginal<typeof import('./boot.js')>(),
  waitForRendererAppReady: async () => undefined
}));
vi.mock('./paths.js', () => ({ resolveAppPaths: () => ({
  app_data_dir: state.root, app_config_dir: state.root,
  app_cache_dir: path.join(state.root, 'cache'), app_log_dir: path.join(state.root, 'logs')
}) }));

function save(message: string, time: string | number, enabled: boolean, previous?: ReminderRule, destination?: ReminderRule['destination']) {
  return handleReminderCommand(NATIVE_COMMANDS.saveDesktopReminder, {
    message, enabled, trigger: typeof time === 'string' ? { kind: 'daily', time } : { kind: 'foreground', minutes: time },
    destination, ...(previous && { previous })
  }) as ReminderRule;
}

beforeEach(async () => {
  state.root = await mkdtemp(path.join(os.tmpdir(), 'foliole-desktop-reminders-'));
  initializeDatabase();
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 10, 10, 12, 0));
  state.focused = false;
  state.show.mockClear();
  state.click.clear();
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
    message: 'Wrong shape', trigger: { kind: 'daily', time: '12:01' }, enabled: 'true'
  })).toThrow();
  await vi.advanceTimersByTimeAsync(60_000);
  expect(state.show.mock.calls).toEqual([['Current']]);
  expect(handleReminderCommand(NATIVE_COMMANDS.loadDesktopReminders, {})).toEqual([edited]);
});


function setFocus(focused: boolean) {
  state.focused = focused;
  app.emit(focused ? 'browser-window-focus' : 'browser-window-blur');
}

it('requires uninterrupted foreground time and starts over after lock or blur', async () => {
  const rule = save('Take a break', 1, true);
  closeDatabaseConnection();
  startDesktopReminders();
  expect(handleReminderCommand(NATIVE_COMMANDS.loadDesktopReminders, {})).toEqual([rule]);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(state.show).not.toHaveBeenCalled();

  setFocus(true);
  await vi.advanceTimersByTimeAsync(45_000);
  setFocus(false);
  await vi.advanceTimersByTimeAsync(60_000);
  setFocus(true);
  await vi.advanceTimersByTimeAsync(45_000);
  expect(state.show).not.toHaveBeenCalled();

  powerMonitor.emit('lock-screen');
  await vi.advanceTimersByTimeAsync(60_000);
  powerMonitor.emit('unlock-screen');
  await vi.advanceTimersByTimeAsync(59_999);
  expect(state.show).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(state.show.mock.calls).toEqual([['Take a break']]);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(state.show).toHaveBeenCalledTimes(1);
  setFocus(false);
  await vi.advanceTimersByTimeAsync(1);
  setFocus(true);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(state.show).toHaveBeenCalledTimes(2);
});


it('opens Flow from the current enabled notification and ignores a disabled rule and a rule with no destination', async () => {
  const send = vi.fn();
  const openWindow = vi.fn(async () => ({ isDestroyed: () => false, webContents: { send } }));
  installDesktopReminderNavigation(openWindow as unknown as Parameters<typeof installDesktopReminderNavigation>[0]);
  const enabled = save('Open Flow', '12:01', true, undefined, 'flow');
  const disabled = save('Old Flow', '12:01', true, undefined, 'flow');
  save('Just remind', '12:01', true);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(handleReminderCommand(NATIVE_COMMANDS.loadDesktopReminders, {})).toContainEqual(enabled);
  expect(state.show).toHaveBeenCalledTimes(3);
  save(disabled.message, '12:01', false, disabled, 'flow');

  expect(state.click.has('Just remind')).toBe(false);
  state.click.get('Old Flow')?.();
  state.click.get('Open Flow')?.();
  await vi.advanceTimersByTimeAsync(0);
  expect(openWindow).toHaveBeenCalledTimes(1);
  expect(send).toHaveBeenCalledExactlyOnceWith(IPC_MENU_EVENT_CHANNEL, { commandId: DESKTOP_REMINDER_OPEN_FLOW });
});


it('persists the Dive ID and dispatches the matching destination on notification click', async () => {
  const send = vi.fn();
  const openWindow = vi.fn(async () => ({ isDestroyed: () => false, webContents: { send } }));
  installDesktopReminderNavigation(openWindow as unknown as Parameters<typeof installDesktopReminderNavigation>[0]);
  const rule = save('Open Physics', '12:01', true, undefined, { kind: 'dive', diveId: 'physics' });
  stopDesktopReminders();
  closeDatabaseConnection();
  startDesktopReminders();
  expect(handleReminderCommand(NATIVE_COMMANDS.loadDesktopReminders, {})).toEqual([rule]);
  await vi.advanceTimersByTimeAsync(60_000);
  state.click.get(rule.message)?.();
  await vi.advanceTimersByTimeAsync(0);
  expect(send).toHaveBeenCalledExactlyOnceWith(IPC_MENU_EVENT_CHANNEL, {
    commandId: DESKTOP_REMINDER_OPEN_DIVE_PREFIX + 'physics'
  });
});

it('persists a preset only on save and keeps its identity across edits and reload', () => {
  expect(handleReminderCommand(NATIVE_COMMANDS.loadDesktopReminders, {})).toEqual([]);
  const draft = { preset: 'seedling', message: '🌱', trigger: { kind: 'daily', time: '20:00' },
    enabled: false, destination: 'flow' };
  const first = handleReminderCommand(NATIVE_COMMANDS.saveDesktopReminder, draft) as ReminderRule;
  expect(first).toMatchObject(draft);
  expect(() => handleReminderCommand(NATIVE_COMMANDS.saveDesktopReminder, draft)).toThrow();
  const edited = save('Evening Flow', '19:30', false, first, 'flow');
  expect(edited).toMatchObject({ id: first.id, preset: 'seedling', message: 'Evening Flow', enabled: false });
  closeDatabaseConnection();
  expect(handleReminderCommand(NATIVE_COMMANDS.loadDesktopReminders, {})).toEqual([edited]);
  expect(state.show).not.toHaveBeenCalled();
});
