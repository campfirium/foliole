import type { NativeInvoke } from '../../../lib/platform/nativeContract';

import type { DiagnosticLogPayload } from './runtimeLogging';

export interface ElectronDebugMetadata {
  preloadPath: string | null;
  runtimeHead: string | null;
  workspaceDebugBridge?: boolean;
}

export interface ElectronRuntimeConfig {
  guidedSampleLocale: 'en-US' | 'zh-CN' | null;
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

export interface WorkspaceSyncAppliedPayload {
  appliedNodeIds: string[];
  appliedObjectIds: string[];
  appliedReviewOpIds: string[];
}

export interface ReadwiseReaderImportProgressPayload {
  currentSourcePath?: string | null;
  highlightProcessedCount?: number;
  highlightTotalCount?: number;
  importWriteElapsedMs?: number;
  indexFailedCount?: number;
  indexElapsedMs?: number;
  indexPendingCount?: number;
  indexProcessedCount?: number;
  indexTotalCount?: number;
  phase?: 'indexing' | 'scanning' | 'writing' | 'source_completed';
  processedCount: number;
  sourceProcessedCount?: number;
  sourceTotalCount?: number;
  status: 'cancelled' | 'running' | 'completed' | 'failed';
  totalCount: number;
}

export interface WorkspaceContentChangedPayload {
  scope: 'workspace';
}

export interface SearchIndexRebuildStatusPayload {
  error?: string;
  status: 'failed' | 'ready' | 'rebuilding';
  strategy: 'cjk-trigram' | 'word-based';
}

export interface ExternalDocumentFileOpenedPayload {
  absolutePath: string;
  folderId: string;
}

export interface LocalFileOpenedPayload {
  absolutePath: string;
}

export interface GlobalCaptureNavigatePayload {
  nodeId: string;
}

export interface ElectronAPI {
  debug?: ElectronDebugMetadata;
  invoke: NativeInvoke;
  logDiagnosticEvent?: (input: DiagnosticLogPayload) => Promise<void>;
  onGlobalCaptureNavigate?: (handler: (payload: GlobalCaptureNavigatePayload) => void) => () => void;
  onManagedInboxUpdated: (handler: (importId: string) => void) => () => void;
  onNativeMenuCommand: (handler: (commandId: string) => void) => () => void;
  onNativeKeyboardInput?: (handler: (payload: NativeKeyboardInputPayload) => void) => () => void;
  onReadwiseBookEpubProgress?: (
    handler: (payload: { detail: string; nodeId: string; phase: string; progress: number }) => void
  ) => () => void;
  onReadwiseReaderImportProgress?: (
    handler: (payload: ReadwiseReaderImportProgressPayload) => void
  ) => () => void;
  onSearchIndexRebuildStatus?: (handler: (payload: SearchIndexRebuildStatusPayload) => void) => () => void;
  onWorkspaceContentChanged?: (handler: (payload: WorkspaceContentChangedPayload) => void) => () => void;
  onWorkspaceSyncApplied?: (handler: (payload: WorkspaceSyncAppliedPayload) => void) => () => void;
  onCompanionPairingRequestsChanged?: (handler: () => void) => () => void;
  onExternalDocumentFileOpened?: (handler: (payload: ExternalDocumentFileOpenedPayload) => void) => () => void;
  onLocalFileOpened?: (handler: (payload: LocalFileOpenedPayload) => void) => () => void;
  onWindowResized: (handler: () => void) => () => void;
  runtimeConfig?: ElectronRuntimeConfig;
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
