/* global __filename, process */

const { contextBridge, ipcRenderer } = require('electron');

const preloadPath = typeof __filename === 'string' ? __filename : null;

const IPC_INVOKE_CHANNEL = 'foliole:invoke';
const IPC_DIAGNOSTIC_LOG_CHANNEL = 'foliole:diagnostics:log-event';
const IPC_MANAGED_INBOX_UPDATED_EVENT_CHANNEL = 'foliole:managed-inbox-updated';
const IPC_MENU_EVENT_CHANNEL = 'foliole:native-menu-command';
const IPC_READWISE_BOOK_EPUB_PROGRESS_EVENT_CHANNEL = 'foliole:readwise-book-epub-progress';
const IPC_READWISE_READER_IMPORT_PROGRESS_EVENT_CHANNEL = 'foliole:readwise-reader-import-progress';
const IPC_WORKSPACE_CONTENT_CHANGED_EVENT_CHANNEL = 'foliole:workspace-content-changed';
const IPC_WORKSPACE_SYNC_APPLIED_EVENT_CHANNEL = 'foliole:workspace-sync-applied';
const IPC_WINDOW_RESIZED_EVENT_CHANNEL = 'foliole:window-resized';
const IPC_HOTKEY_RECORDER_ACTIVE_CHANNEL = 'foliole:hotkey-recorder-active';
const IPC_NATIVE_KEYBOARD_INPUT_EVENT_CHANNEL = 'foliole:native-keyboard-input';
const IPC_COMPANION_PAIRING_REQUESTS_CHANGED_CHANNEL = 'foliole:companion-pairing-requests-changed';
const IPC_EXTERNAL_DOCUMENT_FILE_OPENED_CHANNEL = 'foliole:external-document-file-opened';

function isDesktopDebugProbeEnabled() {
  return process.env.FOLIOLE_ENABLE_DESKTOP_DEBUG_PROBE === '1' || Boolean(process.env.ELECTRON_RENDERER_URL);
}

function isWorkspaceDebugBridgeEnabled() {
  if (process.env.FOLIOLE_ENABLE_WORKSPACE_DEBUG_BRIDGE === '1' && process.env.FOLIOLE_ALLOW_PARALLEL_INSTANCE === '1') {
    return true;
  }
  const workdir = process.env.FOLIOLE_WORKDIR;
  return process.env.FOLIOLE_ALLOW_PARALLEL_INSTANCE === '1' && Boolean(workdir) && workdir !== process.cwd?.();
}

function subscribe(channel, handler) {
  if (
    channel !== IPC_MANAGED_INBOX_UPDATED_EVENT_CHANNEL &&
    channel !== IPC_MENU_EVENT_CHANNEL &&
    channel !== IPC_READWISE_BOOK_EPUB_PROGRESS_EVENT_CHANNEL &&
    channel !== IPC_READWISE_READER_IMPORT_PROGRESS_EVENT_CHANNEL &&
    channel !== IPC_WORKSPACE_CONTENT_CHANGED_EVENT_CHANNEL &&
    channel !== IPC_WORKSPACE_SYNC_APPLIED_EVENT_CHANNEL &&
    channel !== IPC_WINDOW_RESIZED_EVENT_CHANNEL &&
    channel !== IPC_NATIVE_KEYBOARD_INPUT_EVENT_CHANNEL &&
    channel !== IPC_COMPANION_PAIRING_REQUESTS_CHANGED_CHANNEL &&
    channel !== IPC_EXTERNAL_DOCUMENT_FILE_OPENED_CHANNEL
  ) {
    return () => undefined;
  }

  const listener = (_event, payload) => {
    if (channel === IPC_MANAGED_INBOX_UPDATED_EVENT_CHANNEL) {
      handler(payload?.importId ?? '');
      return;
    }
    if (channel === IPC_MENU_EVENT_CHANNEL) {
      handler(payload?.commandId ?? '');
      return;
    }
    if (channel === IPC_NATIVE_KEYBOARD_INPUT_EVENT_CHANNEL) {
      handler({
        altKey: Boolean(payload?.altKey),
        code: payload?.code ?? '',
        controlKey: Boolean(payload?.controlKey),
        key: payload?.key ?? '',
        metaKey: Boolean(payload?.metaKey),
        shiftKey: Boolean(payload?.shiftKey),
        type: payload?.type ?? ''
      });
      return;
    }
    if (channel === IPC_EXTERNAL_DOCUMENT_FILE_OPENED_CHANNEL) {
      handler({
        absolutePath: typeof payload?.absolutePath === 'string' ? payload.absolutePath : '',
        folderId: typeof payload?.folderId === 'string' ? payload.folderId : ''
      });
      return;
    }
    if (channel === IPC_READWISE_BOOK_EPUB_PROGRESS_EVENT_CHANNEL) {
      handler({
        detail: payload?.detail ?? '',
        nodeId: payload?.nodeId ?? '',
        phase: payload?.phase ?? '',
        progress: typeof payload?.progress === 'number' ? payload.progress : 0
      });
      return;
    }
    if (channel === IPC_READWISE_READER_IMPORT_PROGRESS_EVENT_CHANNEL) {
      const processedCount = typeof payload?.processedCount === 'number' ? payload.processedCount : NaN;
      const totalCount = typeof payload?.totalCount === 'number' ? payload.totalCount : NaN;
      const status = payload?.status ?? '';
      if (
        !Number.isFinite(processedCount) ||
        !Number.isFinite(totalCount) ||
        processedCount < 0 ||
        totalCount < 0 ||
        processedCount > totalCount ||
        (status !== 'cancelled' && status !== 'running' && status !== 'completed' && status !== 'failed')
      ) {
        return;
      }
      handler({
        currentSourcePath: typeof payload?.currentSourcePath === 'string' ? payload.currentSourcePath : null,
        highlightProcessedCount: typeof payload?.highlightProcessedCount === 'number' ? payload.highlightProcessedCount : undefined,
        highlightTotalCount: typeof payload?.highlightTotalCount === 'number' ? payload.highlightTotalCount : undefined,
        importWriteElapsedMs: typeof payload?.importWriteElapsedMs === 'number' ? payload.importWriteElapsedMs : undefined,
        indexFailedCount: typeof payload?.indexFailedCount === 'number' ? payload.indexFailedCount : undefined,
        indexElapsedMs: typeof payload?.indexElapsedMs === 'number' ? payload.indexElapsedMs : undefined,
        indexPendingCount: typeof payload?.indexPendingCount === 'number' ? payload.indexPendingCount : undefined,
        indexProcessedCount: typeof payload?.indexProcessedCount === 'number' ? payload.indexProcessedCount : undefined,
        indexTotalCount: typeof payload?.indexTotalCount === 'number' ? payload.indexTotalCount : undefined,
        phase: typeof payload?.phase === 'string' ? payload.phase : undefined,
        processedCount,
        sourceProcessedCount: typeof payload?.sourceProcessedCount === 'number' ? payload.sourceProcessedCount : undefined,
        sourceTotalCount: typeof payload?.sourceTotalCount === 'number' ? payload.sourceTotalCount : undefined,
        status,
        totalCount
      });
      return;
    }
    if (channel === IPC_WORKSPACE_SYNC_APPLIED_EVENT_CHANNEL) {
      handler({
        appliedNodeIds: Array.isArray(payload?.appliedNodeIds) ? payload.appliedNodeIds.filter((value) => typeof value === 'string') : [],
        appliedObjectIds: Array.isArray(payload?.appliedObjectIds) ? payload.appliedObjectIds.filter((value) => typeof value === 'string') : [],
        appliedReviewOpIds: Array.isArray(payload?.appliedReviewOpIds) ? payload.appliedReviewOpIds.filter((value) => typeof value === 'string') : []
      });
      return;
    }
    if (channel === IPC_WORKSPACE_CONTENT_CHANGED_EVENT_CHANNEL) {
      handler({
        scope: payload?.scope === 'workspace' ? 'workspace' : ''
      });
      return;
    }
    handler();
  };

  ipcRenderer.on(channel, listener);
  return () => {
    ipcRenderer.removeListener(channel, listener);
  };
}

const electronApi = {
  invoke: (command, args) => ipcRenderer.invoke(IPC_INVOKE_CHANNEL, { command, args }),
  logDiagnosticEvent: (input) => ipcRenderer.invoke(IPC_DIAGNOSTIC_LOG_CHANNEL, input),
  onManagedInboxUpdated: (handler) => subscribe(IPC_MANAGED_INBOX_UPDATED_EVENT_CHANNEL, handler),
  onNativeMenuCommand: (handler) => subscribe(IPC_MENU_EVENT_CHANNEL, handler),
  onNativeKeyboardInput: (handler) => subscribe(IPC_NATIVE_KEYBOARD_INPUT_EVENT_CHANNEL, handler),
  onReadwiseBookEpubProgress: (handler) => subscribe(IPC_READWISE_BOOK_EPUB_PROGRESS_EVENT_CHANNEL, handler),
  onReadwiseReaderImportProgress: (handler) =>
    subscribe(IPC_READWISE_READER_IMPORT_PROGRESS_EVENT_CHANNEL, handler),
  onWorkspaceContentChanged: (handler) => subscribe(IPC_WORKSPACE_CONTENT_CHANGED_EVENT_CHANNEL, handler),
  onWorkspaceSyncApplied: (handler) => subscribe(IPC_WORKSPACE_SYNC_APPLIED_EVENT_CHANNEL, handler),
  onCompanionPairingRequestsChanged: (handler) => subscribe(IPC_COMPANION_PAIRING_REQUESTS_CHANGED_CHANNEL, handler),
  onExternalDocumentFileOpened: (handler) => subscribe(IPC_EXTERNAL_DOCUMENT_FILE_OPENED_CHANNEL, handler),
  onWindowResized: (handler) => subscribe(IPC_WINDOW_RESIZED_EVENT_CHANNEL, handler),
  setNativeHotkeyRecordingActive: (active) => ipcRenderer.send(IPC_HOTKEY_RECORDER_ACTIVE_CHANNEL, active === true)
};

if (isDesktopDebugProbeEnabled()) {
  electronApi.debug = {
    preloadPath,
    runtimeHead: process.env.FOLIOLE_RUNTIME_HEAD ?? null,
    workspaceDebugBridge: isWorkspaceDebugBridgeEnabled()
  };
}

contextBridge.exposeInMainWorld('electronAPI', electronApi);
