import { LocalNotifications } from '@capacitor/local-notifications';

import { isReminderForDevice, type ReminderRule } from '../../../../../lib/core/reminders/reminderRule';
import { readNativeAppActiveState, subscribeNativeAppActiveState } from '../../appLifecycle';
import { logRuntimeError } from '../../runtimeLogging';

import { COMPANION_REMINDER_NOTIFICATION_OWNER } from './companionReminderNotifications';
import { loadCompanionReminderDevice, loadCompanionReminderRules, onCompanionReminderChange } from './companionReminderRepository';

type ForegroundRule = ReminderRule & { trigger: { kind: 'foreground'; minutes: number } };

async function showReminder(rule: ForegroundRule, valid: () => boolean) {
  const { display } = await LocalNotifications.checkPermissions();
  const { notifications } = await LocalNotifications.getPending();
  if (display !== 'granted' || !valid() || !await readNativeAppActiveState() || !valid()) return;
  const used = new Set(notifications.map(item => item.id));
  let id = 510_000_000;
  while (used.has(id)) id += 1;
  await LocalNotifications.schedule({ notifications: [{
    id, title: 'Foliole', body: rule.message,
    extra: { owner: COMPANION_REMINDER_NOTIFICATION_OWNER, ruleId: rule.id, revision: rule.revision }
  }] });
}

export function startCompanionForegroundReminders() {
  let disposed = false;
  let active = false;
  let generation = 0;
  const timers = new Map<string, { revision: string; timer: ReturnType<typeof setTimeout> }>();
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
      const timer = setTimeout(() => {
        const versionAtFire = generation;
        void showReminder(rule, () => active && !disposed && timers.get(rule.id)?.timer === timer && generation === versionAtFire).catch(report);
      }, rule.trigger.minutes * 60_000);
      timers.set(rule.id, { revision: rule.revision, timer });
    }
  }
  function setActive(next: boolean) {
    if (active === next || disposed) return;
    active = next;
    if (!active) for (const id of timers.keys()) clear(id);
    void refresh().catch(report);
  }
  const stopChanges = onCompanionReminderChange(() => { void refresh().catch(report); });
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
