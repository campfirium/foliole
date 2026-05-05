import type { NativeInvoke } from '../../../lib/platform/nativeContract';

import type { DiagnosticLogPayload } from './runtimeLogging';

export interface ElectronDebugMetadata {
  preloadPath: string | null;
  runtimeHead: string | null;
}

export interface NativeKeyboardInputPayload {
  altKey: boolean;
  code: string;
  controlKey: boolean;
  key: string;
  metaKey: boolean;
  shiftKey: boolean;
  type: string;
}

export interface ElectronAPI {
  debug?: ElectronDebugMetadata;
  invoke: NativeInvoke;
  logDiagnosticEvent?: (input: DiagnosticLogPayload) => Promise<void>;
  onManagedInboxUpdated: (handler: (importId: string) => void) => () => void;
  onNativeMenuCommand: (handler: (commandId: string) => void) => () => void;
  onNativeKeyboardInput?: (handler: (payload: NativeKeyboardInputPayload) => void) => () => void;
  onReadwiseBookEpubProgress?: (
    handler: (payload: { detail: string; nodeId: string; phase: string; progress: number }) => void
  ) => () => void;
  onWindowResized: (handler: () => void) => () => void;
  setNativeHotkeyRecordingActive?: (active: boolean) => void;
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
