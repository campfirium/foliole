import type { NativeInvoke } from '../../../lib/platform/nativeContract';

export interface ElectronAPI {
  invoke: NativeInvoke;
  onNativeMenuCommand: (handler: (commandId: string) => void) => () => void;
  onWindowResized: (handler: () => void) => () => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export function getElectronAPI(): ElectronAPI | null {
  if (typeof window === 'undefined') {
    return null;
  }
  return window.electronAPI ?? null;
}
