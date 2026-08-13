import { NATIVE_COMMANDS } from '../../../../lib/platform/nativeCommands';
import { invokeDesktopCompanionPairingCommand } from '../desktopCompanionPairingRuntimeRepository';

export function enableDesktopCompanionSync() {
  return invokeDesktopCompanionPairingCommand(NATIVE_COMMANDS.enableCompanionSync);
}

export function disableDesktopCompanionSync() {
  return invokeDesktopCompanionPairingCommand(NATIVE_COMMANDS.disableCompanionSync);
}

export function pauseDesktopCompanionSync() {
  return invokeDesktopCompanionPairingCommand(NATIVE_COMMANDS.pauseCompanionSync);
}

export function resumeDesktopCompanionSync() {
  return invokeDesktopCompanionPairingCommand(NATIVE_COMMANDS.resumeCompanionSync);
}
