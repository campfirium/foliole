import { z } from 'zod';

import { reminderRuleSchema } from '../../lib/core/reminders/reminderRule.js';
import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
import { loadDesktopReminders, saveDesktopReminder } from '../reminders/desktopReminderRepository.js';
import { scheduleDesktopReminder } from '../reminders/desktopReminderRuntime.js';

const reminderDraftSchema = z.object({
  message: z.string(),
  enabled: z.boolean(),
  trigger: reminderRuleSchema.shape.trigger,
  destination: reminderRuleSchema.shape.destination,
  preset: reminderRuleSchema.shape.preset,
  previous: z.object({ id: z.uuid(), revision: z.uuid() }).optional()
});

export function handleReminderCommand(command: string, args: Record<string, unknown>) {
  if (command === NATIVE_COMMANDS.loadDesktopReminders) return loadDesktopReminders();
  if (command === NATIVE_COMMANDS.saveDesktopReminder) {
    const { previous, trigger, ...fields } = reminderDraftSchema.parse(args);
    if (trigger.kind === 'once') throw new Error('Unsupported desktop reminder trigger.');
    const rule = saveDesktopReminder({ ...fields, trigger, ...(previous && { previous }) });
    scheduleDesktopReminder(rule);
    return rule;
  }
  return undefined;
}
