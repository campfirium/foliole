import { z } from 'zod';

const reminderId = z.string().uuid();
const dailyTime = z.string().regex(/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/u);
const device = z.object({
  kind: z.enum(['standalone', 'sync-member']),
  id: z.string().min(1)
});

export const reminderRuleSchema = z.object({
  id: reminderId,
  revision: reminderId,
  message: z.string().trim().min(1),
  trigger: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('daily'), time: dailyTime }),
    z.object({ kind: z.literal('foreground'), minutes: z.number().int().min(1).max(1440) }),
    z.object({ kind: z.literal('once'), at: z.iso.datetime() })
  ]),
  preset: z.enum(['seedling', 'coffee']).optional(),
  destination: z.union([z.literal('flow'), z.object({ kind: z.literal('dive'), diveId: z.string().min(1) })]).optional(),
  device,
  enabled: z.boolean()
});

export type ReminderRule = z.infer<typeof reminderRuleSchema>;
export type ReminderDevice = ReminderRule['device'];

export const REMINDER_SETTING_PREFIX = 'reminder-rule-';
export const REMINDER_SETTING_OWNER = {
  scope: 'user_space', platform: 'windows', form_factor: 'desktop'
} as const;

export function reminderSettingKey(id: string) {
  return REMINDER_SETTING_PREFIX + reminderId.parse(id);
}

export function isReminderForDevice(rule: ReminderRule, current: ReminderDevice) {
  return rule.device.kind === current.kind && rule.device.id === current.id;
}

export function isReminderTriggerPast(trigger: ReminderRule['trigger'], now = Date.now()) {
  return trigger.kind === 'once' && Date.parse(trigger.at) <= now;
}
