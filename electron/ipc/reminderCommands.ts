import { z } from 'zod';

import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
import { loadDesktopReminders, saveDesktopReminder } from '../reminders/desktopReminderRepository.js';
import { scheduleDesktopReminder } from '../reminders/desktopReminderRuntime.js';

const reminderDraftSchema = z.object({
  message: z.string(),
  enabled: z.boolean(),
  time: z.string(),
  previous: z.object({ id: z.uuid(), revision: z.uuid() }).optional()
});

export function handleReminderCommand(command: string, args: Record<string, unknown>) {
  if (command === NATIVE_COMMANDS.loadDesktopReminders) return loadDesktopReminders();
  if (command === NATIVE_COMMANDS.saveDesktopReminder) {
    const { previous, ...fields } = reminderDraftSchema.parse(args);
    const rule = saveDesktopReminder({ ...fields, ...(previous && { previous }) });
    scheduleDesktopReminder(rule);
    return rule;
  }
  return undefined;
}
