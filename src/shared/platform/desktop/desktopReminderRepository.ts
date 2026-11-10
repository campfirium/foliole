import { NATIVE_COMMANDS } from '../../../../lib/platform/nativeCommands';
import type { DesktopReminderDraft } from '../../../../lib/platform/nativeReminderContract';
import { getRuntimeInvoke } from '../runtimeInvoke';

export function getDesktopReminderRepository() {
  const invoke = getRuntimeInvoke();
  return invoke ? {
    load: () => invoke(NATIVE_COMMANDS.loadDesktopReminders),
    save: (draft: DesktopReminderDraft) => invoke(NATIVE_COMMANDS.saveDesktopReminder, draft)
  } : null;
}
