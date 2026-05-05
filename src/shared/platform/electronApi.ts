import type { NativeInvoke } from '../../../lib/platform/nativeContract';

export interface ElectronWindowControls {
  close: () => Promise<void>;
  isMaximized: () => Promise<boolean>;
  minimize: () => Promise<void>;
  onResized: (handler: () => void) => () => void;
  toggleMaximize: () => Promise<void>;
}

export interface ElectronAPI {
  invoke: NativeInvoke;
  on: (channel: string, handler: (...args: unknown[]) => void) => () => void;
  windowControls: ElectronWindowControls;
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
