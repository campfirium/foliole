import { NATIVE_COMMANDS } from '../../../../lib/platform/nativeCommands';
import { invokeDesktopSyncGroupCommand } from '../desktopSyncGroupRuntimeRepository';

export function enableDesktopCompanionSync() {
  return invokeDesktopSyncGroupCommand(NATIVE_COMMANDS.enableCompanionSync);
}

export function disableDesktopCompanionSync() {
  return invokeDesktopSyncGroupCommand(NATIVE_COMMANDS.disableCompanionSync);
}

export function pauseDesktopCompanionSync() {
  return invokeDesktopSyncGroupCommand(NATIVE_COMMANDS.pauseCompanionSync);
}

export function resumeDesktopCompanionSync() {
  return invokeDesktopSyncGroupCommand(NATIVE_COMMANDS.resumeCompanionSync);
}
