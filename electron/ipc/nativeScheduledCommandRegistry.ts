import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';

export const NATIVE_SCHEDULED_COMMAND_REGISTRY = [
  { command: NATIVE_COMMANDS.saveDailyFlowSourceSettings, route: 'storage', capability: 'dataMutation' },
  { command: NATIVE_COMMANDS.readDailyFlowView, route: 'storage', capability: 'read' },
  { command: NATIVE_COMMANDS.openDailyFlow, route: 'storage', capability: 'dataMutation' },
  { command: NATIVE_COMMANDS.commitDailyFlow, route: 'storage', capability: 'dataMutation' },
  { command: NATIVE_COMMANDS.loadDesktopReminders, route: 'storage', capability: 'read' },
  { command: NATIVE_COMMANDS.saveDesktopReminder, route: 'storage', capability: 'settingsMutation' }
] as const;
