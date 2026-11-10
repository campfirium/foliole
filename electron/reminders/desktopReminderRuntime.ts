import { Notification } from 'electron';

import { isReminderForDevice, type ReminderRule } from '../../lib/core/reminders/reminderRule.js';
import { runWithDatabaseConnectionOwner } from '../database/connection.js';
import { appendMainProcessDiagnosticLog } from '../diagnostics/mainProcessDiagnostics.js';

import { isReminderForeground, subscribeReminderForeground } from './desktopReminderForeground.js';
import { openDesktopReminderDestination } from './desktopReminderNavigation.js';
import { loadDesktopReminder, loadDesktopReminderDevice, loadDesktopReminders } from './desktopReminderRepository.js';

const timers = new Map<string, ReturnType<typeof setTimeout>>();
const delivered = new Map<string, Notification>();
const foregroundRules = new Map<string, ReminderRule>();
let unsubscribeForeground: (() => void) | undefined;

function reportFailure(error: unknown) {
  appendMainProcessDiagnosticLog('desktop_reminder_failed', { error });
}

function deliverReminder(rule: ReminderRule) {
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
        const current = loadDesktopReminder(rule.id);
        return current?.enabled && current.revision === rule.revision &&
          isReminderForDevice(current, loadDesktopReminderDevice()) ? current.destination : undefined;
      }).then(openDesktopReminderDestination).catch(reportFailure);
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

export function scheduleDesktopReminder(rule: ReminderRule) {
  cancelReminderTimer(rule.id);
  foregroundRules.delete(rule.id);
  if (!rule.enabled || rule.trigger.kind === 'once') return;
  if (rule.trigger.kind === 'foreground') {
    foregroundRules.set(rule.id, rule);
    if (isReminderForeground()) armReminderTimer(rule, rule.trigger.minutes * 60_000);
    return;
  }
  const now = Date.now();
  armReminderTimer(rule, nextDailyOccurrence(rule.trigger.time, now) - now);
}

function armReminderTimer(rule: ReminderRule, delay: number) {
  const dueAt = Date.now() + delay;
  const timer = setTimeout(() => {
    void runWithDatabaseConnectionOwner(() => {
      if (timers.get(rule.id) !== timer) return;
      timers.delete(rule.id);
      const current = loadDesktopReminder(rule.id);
      if (!current?.enabled || current.revision !== rule.revision ||
        !isReminderForDevice(current, loadDesktopReminderDevice())) return;
      if (current.trigger.kind === 'foreground') {
        if (isReminderForeground()) deliverReminder(current);
        return;
      }
      scheduleDesktopReminder(current);
      if (Date.now() >= dueAt) deliverReminder(current);
    }).catch(reportFailure);
  }, delay);
  timer.unref();
  timers.set(rule.id, timer);
}

function updateForegroundReminders(focused: boolean) {
  for (const rule of foregroundRules.values()) {
    cancelReminderTimer(rule.id);
    if (focused && rule.trigger.kind === 'foreground') {
      armReminderTimer(rule, rule.trigger.minutes * 60_000);
    }
  }
}

export function startDesktopReminders() {
  try {
    unsubscribeForeground ??= subscribeReminderForeground(updateForegroundReminders);
    for (const rule of loadDesktopReminders()) scheduleDesktopReminder(rule);
  } catch (error) {
    reportFailure(error);
  }
}

export function stopDesktopReminders() {
  unsubscribeForeground?.();
  unsubscribeForeground = undefined;
  foregroundRules.clear();
  for (const timer of timers.values()) clearTimeout(timer);
  timers.clear();
  delivered.clear();
}
