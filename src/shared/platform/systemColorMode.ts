import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';

import { getElectronAPI } from './electronApi';
import { getRuntimeInvoke } from './runtimeInvoke';

export type SystemColorMode = 'dark' | 'light';

let runtimeSystemColorMode: SystemColorMode | null = null;

export function getRuntimeSystemColorMode() {
  return runtimeSystemColorMode;
}

export function setRuntimeSystemColorMode(value: unknown) {
  runtimeSystemColorMode = value === 'dark' || value === 'light' ? value : null;
}

export async function loadRuntimeSystemColorMode() {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) return null;
  try {
    setRuntimeSystemColorMode(await runtimeInvoke(NATIVE_COMMANDS.loadSystemColorMode));
  } catch {
    setRuntimeSystemColorMode(null);
  }
  return runtimeSystemColorMode;
}

export function subscribeRuntimeSystemColorMode(handler: (mode: SystemColorMode) => void) {
  const subscribe = getElectronAPI()?.onSystemColorModeChanged;
  if (!subscribe) return null;
  return subscribe((mode) => {
    setRuntimeSystemColorMode(mode);
    handler(mode);
  });
}
