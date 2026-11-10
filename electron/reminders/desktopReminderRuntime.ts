import { Notification } from 'electron';

import { isReminderForDevice, type ReminderRule } from '../../lib/core/reminders/reminderRule.js';
import { runWithDatabaseConnectionOwner } from '../database/connection.js';
import { appendMainProcessDiagnosticLog } from '../diagnostics/mainProcessDiagnostics.js';

import { loadDesktopReminder, loadDesktopReminderDevice, loadDesktopReminders } from './desktopReminderRepository.js';

const timers = new Map<string, ReturnType<typeof setTimeout>>();
const delivered = new Map<string, Notification>();

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

export function scheduleDesktopReminder(rule: ReminderRule) {
  clearTimeout(timers.get(rule.id));
  timers.delete(rule.id);
  if (!rule.enabled || rule.trigger.kind !== 'daily') return;
  const now = Date.now();
  const dueAt = nextDailyOccurrence(rule.trigger.time, now);
  const timer = setTimeout(() => {
    void runWithDatabaseConnectionOwner(() => {
      if (timers.get(rule.id) !== timer) return;
      timers.delete(rule.id);
      const current = loadDesktopReminder(rule.id);
      if (!current?.enabled || current.revision !== rule.revision ||
        !isReminderForDevice(current, loadDesktopReminderDevice())) return;
      scheduleDesktopReminder(current);
      if (Date.now() >= dueAt) deliverReminder(current);
    }).catch(reportFailure);
  }, dueAt - now);
  timer.unref();
  timers.set(rule.id, timer);
}

export function startDesktopReminders() {
  try {
    for (const rule of loadDesktopReminders()) scheduleDesktopReminder(rule);
  } catch (error) {
    reportFailure(error);
  }
}

export function stopDesktopReminders() {
  for (const timer of timers.values()) clearTimeout(timer);
  timers.clear();
  delivered.clear();
}
