import { registerPlugin } from '@capacitor/core';

import { COMPANION_REMINDER_BACKGROUND_ACTION } from '../../../../../lib/core/database/companionReminderActionContract';
import type { ReminderRule } from '../../../../../lib/core/reminders/reminderRule';
import { getStoredAppLocale } from '../../../localization/appLanguage';
import { translate } from '../../../localization/translations';

type ReminderAction = { id: string; title: string };

export type AndroidReminderJob = {
  id: number;
  at: number;
  body: string;
  ruleId: string;
  revision: string;
  owner: string;
  delivered?: boolean;
  snoozedFrom?: number;
  snoozeTitle: string;
  snoozeConfirmation: string;
  actions: ReminderAction[];
};

const native = registerPlugin<{
  list(): Promise<{ jobs: AndroidReminderJob[] }>;
  cancel(args: { id: number }): Promise<void>;
  schedule(job: AndroidReminderJob): Promise<void>;
}>('FolioleReminderNotifications');

export function getReminderBackgroundActions(): ReminderAction[] {
  const locale = getStoredAppLocale();
  return Object.entries(COMPANION_REMINDER_BACKGROUND_ACTION.minutes).map(([id, minutes]) => ({
    id, title: translate(locale, `settings.reminders.snooze${minutes}`)
  }));
}

export async function reconcileAndroidReminderJobs(enabled: Map<string, ReminderRule>, desired: Map<string, ReminderRule>) {
  const { jobs } = await native.list();
  const occupied = new Set(jobs.map(job => job.id));
  for (const job of jobs) {
    if (enabled.get(job.ruleId)?.revision !== job.revision) {
      await native.cancel({ id: job.id });
    } else {
      desired.delete(job.ruleId);
    }
  }
  return occupied;
}

export function scheduleAndroidReminderJob(rule: ReminderRule, at: string, occupied: Set<number>) {
  let id = 650_000_000;
  while (occupied.has(id)) id += 1;
  occupied.add(id);
  const locale = getStoredAppLocale();
  return native.schedule({
    id, at: Date.parse(at), body: rule.message, ruleId: rule.id, revision: rule.revision,
    owner: COMPANION_REMINDER_BACKGROUND_ACTION.owner, actions: getReminderBackgroundActions(),
    snoozeTitle: translate(locale, 'settings.reminders.snoozeTitle'),
    snoozeConfirmation: translate(locale, 'settings.reminders.snoozeConfirmation', { time: '{time}' })
  });
}
