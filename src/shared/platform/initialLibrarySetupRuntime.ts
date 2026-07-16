import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';

import { getRuntimeInvoke } from './runtimeInvoke';

function requireRuntimeInvoke() {
  const invoke = getRuntimeInvoke();
  if (!invoke) {
    throw new Error('Desktop runtime is unavailable.');
  }
  return invoke;
}

export function loadInitialLibrarySetup() {
  return requireRuntimeInvoke()(NATIVE_COMMANDS.loadInitialLibrarySetup);
}

export function chooseInitialLibraryLocation() {
  return requireRuntimeInvoke()(NATIVE_COMMANDS.chooseInitialLibraryLocation);
}

export function confirmInitialLibrarySetup() {
  return requireRuntimeInvoke()(NATIVE_COMMANDS.confirmInitialLibrarySetup);
}
