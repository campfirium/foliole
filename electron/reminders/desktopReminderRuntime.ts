import { Notification } from 'electron';

import { isReminderForDevice, type ReminderRule } from '../../lib/core/reminders/reminderRule.js';
import {
  isCurrentDatabaseConnection, openDatabaseConnection, registerDatabaseConnectionCleanup,
  runWithDatabaseConnectionOwner, type DatabaseConnection
} from '../database/connection.js';
import { appendMainProcessDiagnosticLog } from '../diagnostics/mainProcessDiagnostics.js';

import { isReminderForeground, subscribeReminderForeground } from './desktopReminderForeground.js';
import { openDesktopReminderDestination } from './desktopReminderNavigation.js';
import { loadDesktopReminder, loadDesktopReminderDevice, loadDesktopReminders } from './desktopReminderRepository.js';

const timers = new Map<string, ReturnType<typeof setTimeout>>();
const delivered = new Map<string, Notification>();
const foregroundRules = new Map<string, { rule: ReminderRule; connection: DatabaseConnection }>();
let loadedConnection: DatabaseConnection | undefined;
let unsubscribeForeground: (() => void) | undefined;
let cleanupRegistered = false;

function reportFailure(error: unknown) {
  appendMainProcessDiagnosticLog('desktop_reminder_failed', { error });
}

function deliverReminder(rule: ReminderRule, connection: DatabaseConnection) {
  if (!Notification.isSupported()) throw new Error('Desktop notifications are unavailable.');
  const notification = new Notification({ title: 'Foliole', body: rule.message });
  delivered.set(rule.id, notification);
  const release = () => {
    if (delivered.get(rule.id) === notification) delivered.delete(rule.id);
  };
  notification.once('close', release);
  if (rule.destination) {
    notification.once('click', () => {
      void runWithDatabaseConnectionOwner(() => {
        if (!isCurrentDatabaseConnection(connection)) return;
        const current = loadDesktopReminder(rule.id);
        return current?.enabled && current.revision === rule.revision &&
          isReminderForDevice(current, loadDesktopReminderDevice()) ? current.destination : undefined;
      }).then(destination => openDesktopReminderDestination(destination, () => isCurrentDatabaseConnection(connection)))
        .catch(reportFailure);
    });
  }
  notification.once('failed', (_event, error) => {
    release();
    reportFailure(error);
  });
  notification.show();
}

function nextDailyOccurrence(time: string, now: number) {
  const [hours, minutes] = time.split(':').map(Number) as [number, number];
  const occurrence = new Date(now);
  occurrence.setHours(hours, minutes, 0, 0);
  if (occurrence.getTime() <= now) {
    occurrence.setDate(occurrence.getDate() + 1);
    occurrence.setHours(hours, minutes, 0, 0);
  }
  return occurrence.getTime();
}

function cancelReminderTimer(id: string) {
  clearTimeout(timers.get(id));
  timers.delete(id);
}

export function scheduleDesktopReminder(rule: ReminderRule, connection = openDatabaseConnection()) {
  cancelReminderTimer(rule.id);
  foregroundRules.delete(rule.id);
  if (!rule.enabled || rule.trigger.kind === 'once') return;
  if (rule.trigger.kind === 'foreground') {
    foregroundRules.set(rule.id, { rule, connection });
    if (isReminderForeground()) armReminderTimer(rule, connection, rule.trigger.minutes * 60_000);
    return;
  }
  const now = Date.now();
  armReminderTimer(rule, connection, nextDailyOccurrence(rule.trigger.time, now) - now);
}

function armReminderTimer(rule: ReminderRule, connection: DatabaseConnection, delay: number) {
  const dueAt = Date.now() + delay;
  const timer = setTimeout(() => {
    void runWithDatabaseConnectionOwner(() => {
      if (timers.get(rule.id) !== timer || !isCurrentDatabaseConnection(connection)) return;
      timers.delete(rule.id);
      const current = loadDesktopReminder(rule.id);
      if (!current?.enabled || current.revision !== rule.revision ||
        !isReminderForDevice(current, loadDesktopReminderDevice())) return;
      if (current.trigger.kind === 'foreground') {
        if (isReminderForeground()) deliverReminder(current, connection);
        return;
      }
      scheduleDesktopReminder(current, connection);
      if (Date.now() >= dueAt) deliverReminder(current, connection);
    }).catch(reportFailure);
  }, delay);
  timer.unref();
  timers.set(rule.id, timer);
}

function updateForegroundReminders(focused: boolean) {
  for (const { rule, connection } of foregroundRules.values()) {
    cancelReminderTimer(rule.id);
    if (focused && rule.trigger.kind === 'foreground') {
      armReminderTimer(rule, connection, rule.trigger.minutes * 60_000);
    }
  }
}

function clearReminderSchedule() {
  loadedConnection = undefined;
  foregroundRules.clear();
  for (const timer of timers.values()) clearTimeout(timer);
  timers.clear();
  delivered.clear();
}

export function refreshDesktopReminders() {
  if (!unsubscribeForeground) return;
  try {
    const connection = openDatabaseConnection();
    if (loadedConnection === connection) return;
    clearReminderSchedule();
    for (const rule of loadDesktopReminders()) scheduleDesktopReminder(rule, connection);
    loadedConnection = connection;
  } catch (error) {
    reportFailure(error);
  }
}

export function startDesktopReminders() {
  try {
    if (!cleanupRegistered) {
      registerDatabaseConnectionCleanup(clearReminderSchedule);
      cleanupRegistered = true;
    }
    unsubscribeForeground ??= subscribeReminderForeground(updateForegroundReminders);
    refreshDesktopReminders();
  } catch (error) {
    reportFailure(error);
  }
}

export function stopDesktopReminders() {
  unsubscribeForeground?.();
  unsubscribeForeground = undefined;
  clearReminderSchedule();
}
