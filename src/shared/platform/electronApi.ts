import type { NativeInvoke } from '../../../lib/platform/nativeContract';

export interface ElectronDebugMetadata {
  preloadPath: string | null;
  runtimeHead: string | null;
}

export interface ElectronAPI {
  debug?: ElectronDebugMetadata;
  invoke: NativeInvoke;
  onManagedInboxUpdated: (handler: (importId: string) => void) => () => void;
  onNativeMenuCommand: (handler: (commandId: string) => void) => () => void;
  onReadwiseBookEpubProgress?: (
    handler: (payload: { detail: string; nodeId: string; phase: string; progress: number }) => void
  ) => () => void;
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
