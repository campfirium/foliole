import { NATIVE_COMMANDS } from './nativeCommands.js';

const SENSITIVE_NATIVE_COMMAND_ARGS = new Set<string>([
  NATIVE_COMMANDS.assistantSaveByokSettings,
  NATIVE_COMMANDS.connectFoliolePublishSettings,
  NATIVE_COMMANDS.saveSystemEntryDisplayNames,
  NATIVE_COMMANDS.saveDiscoursePublishSettings,
  NATIVE_COMMANDS.saveWordPressPublishDraft,
  NATIVE_COMMANDS.connectWordPressPublishSettings
]);

export function canRecordNativeCommandArgs(command: string) {
  return !SENSITIVE_NATIVE_COMMAND_ARGS.has(command);
}
