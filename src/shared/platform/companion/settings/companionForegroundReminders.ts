import { LocalNotifications } from '@capacitor/local-notifications';

import { isReminderForDevice, type ReminderRule } from '../../../../../lib/core/reminders/reminderRule';
import { readNativeAppActiveState, subscribeNativeAppActiveState } from '../../appLifecycle';
import { logRuntimeError } from '../../runtimeLogging';

import { COMPANION_REMINDER_NOTIFICATION_OWNER } from './companionReminderNotifications';
import { loadCompanionReminderDevice, loadCompanionReminderRules, onCompanionReminderChange } from './companionReminderRepository';

type ForegroundRule = ReminderRule & { trigger: { kind: 'foreground'; minutes: number } };
type ForegroundTimer = { revision: string; timer: ReturnType<typeof setTimeout> };

async function showReminder(rule: ForegroundRule, valid: () => boolean, readRefresh: () => Promise<boolean>) {
  const { display } = await LocalNotifications.checkPermissions();
  if (display !== 'granted' || !valid()) return;
  const { notifications } = await LocalNotifications.getPending();
  if (!valid() || !await readNativeAppActiveState()) return;
  const used = new Set(notifications.map(item => item.id));
  let id = 510_000_000;
  while (used.has(id)) id += 1;
  while (valid()) {
    // Only the current rule and foreground session can invalidate a due countdown.
    const refresh = readRefresh();
    const refreshed = await refresh;
    if (refresh !== readRefresh()) continue;
    if (!refreshed || !valid()) return;
    await LocalNotifications.schedule({ notifications: [{
      id, title: 'Foliole', body: rule.message,
      extra: { owner: COMPANION_REMINDER_NOTIFICATION_OWNER, ruleId: rule.id, revision: rule.revision }
    }] });
    return;
  }
}

export function startCompanionForegroundReminders() {
  let disposed = false;
  let active = false;
  let generation = 0;
  let pendingRefresh = Promise.resolve(true);
  const timers = new Map<string, ForegroundTimer>();
  const report = (error: unknown) => logRuntimeError('Foreground reminder failed', {
    area: 'native', action: 'foreground-reminders', error
  });
  function clear(id: string) {
    const entry = timers.get(id);
    if (entry) clearTimeout(entry.timer);
    timers.delete(id);
  }
  async function refresh() {
    const version = ++generation;
    if (!active || disposed) return;
    const [rules, device] = await Promise.all([loadCompanionReminderRules(), loadCompanionReminderDevice()]);
    if (version !== generation || disposed) return;
    const desired = rules.filter((rule): rule is ForegroundRule =>
      rule.enabled && rule.trigger.kind === 'foreground' && isReminderForDevice(rule, device));
    for (const [id, entry] of timers) {
      if (!desired.some(rule => rule.id === id && rule.revision === entry.revision)) clear(id);
    }
    for (const rule of desired) {
      if (timers.has(rule.id)) continue;
      const entry: ForegroundTimer = { revision: rule.revision, timer: setTimeout(() => {
        void showReminder(rule, () => active && !disposed && timers.get(rule.id) === entry, () => pendingRefresh).catch(report);
      }, rule.trigger.minutes * 60_000) };
      timers.set(rule.id, entry);
    }
  }
  function requestRefresh() {
    pendingRefresh = refresh().then(() => true, error => {
      report(error);
      return false;
    });
  }
  function setActive(next: boolean) {
    if (active === next || disposed) return;
    active = next;
    if (!active) for (const id of timers.keys()) clear(id);
    requestRefresh();
  }
  const stopChanges = onCompanionReminderChange(requestRefresh);
  let sawLifecycleEvent = false;
  const lifecycle = subscribeNativeAppActiveState(next => { sawLifecycleEvent = true; setActive(next); });
  void lifecycle.then(async () => {
    const initial = await readNativeAppActiveState();
    if (!sawLifecycleEvent) setActive(initial);
  }).catch(report);
  return () => {
    disposed = true;
    stopChanges();
    for (const id of timers.keys()) clear(id);
    void lifecycle.then(unsubscribe => unsubscribe()).catch(report);
  };
}
