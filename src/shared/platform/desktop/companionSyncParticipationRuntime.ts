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

export function resumeDesktopCompanionSync(confirmedRestoreId?: string) {
  return invokeDesktopSyncGroupCommand(NATIVE_COMMANDS.resumeCompanionSync,
    confirmedRestoreId ? { confirmed_restore_id: confirmedRestoreId } : undefined);
}
