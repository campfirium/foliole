import type { NativeAssistantTurnEvent } from '../../../lib/platform/nativeAssistantContract';
import type { NativeInvoke } from '../../../lib/platform/nativeContract';
import type { NativeDesktopUpdateState } from '../../../lib/platform/nativeUpdateContract';
import type { SyncGroupDiscoverySnapshot } from '../../../lib/platform/syncGroupDiscoveryContract';

import type { DiagnosticLogPayload } from './runtimeLogging';
import type { WorkspaceNodeMutationPatchResult } from './workspaceRuntimeTypes';

interface ElectronDebugMetadata {
  preloadPath: string | null;
  runtimeHead: string | null;
  workspaceDebugBridge?: boolean;
  workspaceDebugSeedPersistence?: boolean;
}

interface ElectronRuntimeConfig {
  guidedSampleLocale: 'en-US' | 'zh-CN' | null;
  systemLanguage: string | null;
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

interface SearchIndexRebuildStatusPayload {
  error?: string;
  status: 'failed' | 'ready' | 'rebuilding';
  strategy: 'cjk-trigram' | 'word-based';
}

interface ExternalDocumentFileOpenedPayload {
  absolutePath: string;
  folderId: string;
  sourceKind?: 'external_document' | 'local_file';
}

export interface GlobalCaptureNavigatePayload {
  nodeId: string;
}

export interface ManagedInboxUpdatedPayload {
  importId: string;
  nodeMutationPatch?: WorkspaceNodeMutationPatchResult | null;
}

export interface ElectronAPI {
  debug?: ElectronDebugMetadata;
  invoke: NativeInvoke;
  logDiagnosticEvent?: (input: DiagnosticLogPayload) => Promise<void>;
  onGlobalCaptureNavigate?: (handler: (payload: GlobalCaptureNavigatePayload) => void) => () => void;
  onManagedInboxUpdated: (handler: (payload: ManagedInboxUpdatedPayload | string) => void) => () => void;
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
  onSyncGroupJoinRequestsChanged?: (handler: () => void) => () => void;
  onSyncGroupDiscoveryChanged?: (handler: (payload: SyncGroupDiscoverySnapshot) => void) => () => void;
  onExternalDocumentFileOpened?: (handler: (payload: ExternalDocumentFileOpenedPayload) => void) => () => void;
  onAssistantTurnEvent?: (handler: (payload: NativeAssistantTurnEvent) => void) => () => void;
  onDesktopUpdateState?: (handler: (payload: NativeDesktopUpdateState) => void) => () => void;
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
