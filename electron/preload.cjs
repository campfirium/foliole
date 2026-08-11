/* global __filename, process */

const { contextBridge, ipcRenderer } = require('electron');

const preloadPath = typeof __filename === 'string' ? __filename : null;

const IPC_INVOKE_CHANNEL = 'foliole:invoke';
const IPC_DIAGNOSTIC_LOG_CHANNEL = 'foliole:diagnostics:log-event';
const IPC_DESKTOP_UPDATE_STATE_EVENT_CHANNEL = 'foliole:desktop-update-state';
const IPC_GLOBAL_CAPTURE_NAVIGATE_CHANNEL = 'foliole:global-capture-navigate';
const IPC_MANAGED_INBOX_UPDATED_EVENT_CHANNEL = 'foliole:managed-inbox-updated';
const IPC_MENU_EVENT_CHANNEL = 'foliole:native-menu-command';
const IPC_READWISE_BOOK_EPUB_PROGRESS_EVENT_CHANNEL = 'foliole:readwise-book-epub-progress';
const IPC_READWISE_READER_IMPORT_PROGRESS_EVENT_CHANNEL = 'foliole:readwise-reader-import-progress';
const IPC_SEARCH_INDEX_REBUILD_STATUS_EVENT_CHANNEL = 'foliole:search-index-rebuild-status';
const IPC_WORKSPACE_CONTENT_CHANGED_EVENT_CHANNEL = 'foliole:workspace-content-changed';
const IPC_WORKSPACE_SYNC_APPLIED_EVENT_CHANNEL = 'foliole:workspace-sync-applied';
const IPC_WINDOW_RESIZED_EVENT_CHANNEL = 'foliole:window-resized';
const IPC_HOTKEY_RECORDER_ACTIVE_CHANNEL = 'foliole:hotkey-recorder-active';
const IPC_NATIVE_KEYBOARD_INPUT_EVENT_CHANNEL = 'foliole:native-keyboard-input';
const IPC_COMPANION_PAIRING_REQUESTS_CHANGED_CHANNEL = 'foliole:companion-pairing-requests-changed';
const IPC_EXTERNAL_DOCUMENT_FILE_OPENED_CHANNEL = 'foliole:external-document-file-opened';
const IPC_ASSISTANT_TURN_EVENT_CHANNEL = 'foliole:assistant-turn-event';

const SUBSCRIBABLE_CHANNELS = new Set([
  IPC_MANAGED_INBOX_UPDATED_EVENT_CHANNEL, IPC_GLOBAL_CAPTURE_NAVIGATE_CHANNEL, IPC_MENU_EVENT_CHANNEL, IPC_READWISE_BOOK_EPUB_PROGRESS_EVENT_CHANNEL, IPC_READWISE_READER_IMPORT_PROGRESS_EVENT_CHANNEL,
  IPC_SEARCH_INDEX_REBUILD_STATUS_EVENT_CHANNEL, IPC_WORKSPACE_CONTENT_CHANGED_EVENT_CHANNEL, IPC_WORKSPACE_SYNC_APPLIED_EVENT_CHANNEL, IPC_WINDOW_RESIZED_EVENT_CHANNEL, IPC_NATIVE_KEYBOARD_INPUT_EVENT_CHANNEL,
  IPC_COMPANION_PAIRING_REQUESTS_CHANGED_CHANNEL, IPC_EXTERNAL_DOCUMENT_FILE_OPENED_CHANNEL, IPC_ASSISTANT_TURN_EVENT_CHANNEL,
  IPC_DESKTOP_UPDATE_STATE_EVENT_CHANNEL
]);

const desktopDebugProbeEnabled = process.env.FOLIOLE_ENABLE_DESKTOP_DEBUG_PROBE === '1'
  || Boolean(process.env.ELECTRON_RENDERER_URL);
const allowParallelInstance = process.env.FOLIOLE_ALLOW_PARALLEL_INSTANCE === '1';
const workdir = process.env.FOLIOLE_WORKDIR;
const workspaceDebugBridgeEnabled = allowParallelInstance && (
  process.env.FOLIOLE_ENABLE_WORKSPACE_DEBUG_BRIDGE === '1'
  || Boolean(workdir && workdir !== process.cwd?.())
);
const stateRoot = process.env.FOLIOLE_ELECTRON_TEST_STATE_ROOT;
const workspaceDebugSeedPersistenceEnabled = workspaceDebugBridgeEnabled
  && Boolean(stateRoot?.trim() && workdir === stateRoot);
const guidedSampleLocale = process.env.FOLIOLE_GUIDED_SAMPLE_LOCALE?.trim();
const guidedSampleLocaleOverride = guidedSampleLocale === 'en-US' || guidedSampleLocale === 'zh-CN'
  ? guidedSampleLocale
  : null;
const systemLanguage = process.env.FOLIOLE_SYSTEM_LANGUAGE?.trim() || null;

function normalizeReadwiseBookEpubProgressPayload(payload) {
  if (
    typeof payload?.detail !== 'string' ||
    typeof payload?.nodeId !== 'string' ||
    typeof payload?.phase !== 'string' ||
    typeof payload?.progress !== 'number' ||
    !Number.isFinite(payload.progress)
  ) {
    return null;
  }
  return {
    detail: payload.detail,
    nodeId: payload.nodeId,
    phase: payload.phase,
    progress: Math.min(1, Math.max(0, payload.progress))
  };
}

function subscribe(channel, handler) {
  if (!SUBSCRIBABLE_CHANNELS.has(channel)) return () => undefined;

  const listener = (_event, payload) => {
    if (channel === IPC_MANAGED_INBOX_UPDATED_EVENT_CHANNEL) {
      handler({
        importId: typeof payload?.importId === 'string' ? payload.importId : '',
        nodeMutationPatch: payload?.nodeMutationPatch ?? null
      });
      return;
    }
    if (channel === IPC_GLOBAL_CAPTURE_NAVIGATE_CHANNEL) {
      handler({
        nodeId: typeof payload?.nodeId === 'string' ? payload.nodeId : ''
      });
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
        folderId: typeof payload?.folderId === 'string' ? payload.folderId : '',
        sourceKind: payload?.sourceKind === 'local_file' || payload?.sourceKind === 'external_document'
          ? payload.sourceKind
          : undefined
      });
      return;
    }
    if (channel === IPC_ASSISTANT_TURN_EVENT_CHANNEL) {
      const kind = payload?.kind;
      if (kind !== 'started' && kind !== 'delta' && kind !== 'completed' && kind !== 'failed') return;
      handler({
        clientTurnId: typeof payload?.clientTurnId === 'string' ? payload.clientTurnId : '', kind,
        failure: payload?.failure?.category ? { category: payload.failure.category } : undefined,
        provider: 'codex-app-server', text: typeof payload?.text === 'string' ? payload.text : undefined,
        providerThreadId: typeof payload?.providerThreadId === 'string' ? payload.providerThreadId : undefined,
        turnId: typeof payload?.turnId === 'string' ? payload.turnId : undefined
      });
      return;
    }
    if (channel === IPC_READWISE_BOOK_EPUB_PROGRESS_EVENT_CHANNEL) {
      const progressPayload = normalizeReadwiseBookEpubProgressPayload(payload);
      if (progressPayload) handler(progressPayload);
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
    if (channel === IPC_SEARCH_INDEX_REBUILD_STATUS_EVENT_CHANNEL) {
      const status = payload?.status;
      const strategy = payload?.strategy;
      if (
        (status !== 'failed' && status !== 'ready' && status !== 'rebuilding') ||
        (strategy !== 'cjk-trigram' && strategy !== 'word-based')
      ) {
        return;
      }
      handler({
        error: typeof payload?.error === 'string' ? payload.error : undefined,
        status,
        strategy
      });
      return;
    }
    if (channel === IPC_DESKTOP_UPDATE_STATE_EVENT_CHANNEL) {
      handler(payload);
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
  onGlobalCaptureNavigate: (handler) => subscribe(IPC_GLOBAL_CAPTURE_NAVIGATE_CHANNEL, handler),
  onNativeMenuCommand: (handler) => subscribe(IPC_MENU_EVENT_CHANNEL, handler),
  onNativeKeyboardInput: (handler) => subscribe(IPC_NATIVE_KEYBOARD_INPUT_EVENT_CHANNEL, handler),
  onReadwiseBookEpubProgress: (handler) => subscribe(IPC_READWISE_BOOK_EPUB_PROGRESS_EVENT_CHANNEL, handler),
  onReadwiseReaderImportProgress: (handler) => subscribe(IPC_READWISE_READER_IMPORT_PROGRESS_EVENT_CHANNEL, handler),
  onSearchIndexRebuildStatus: (handler) => subscribe(IPC_SEARCH_INDEX_REBUILD_STATUS_EVENT_CHANNEL, handler),
  onWorkspaceContentChanged: (handler) => subscribe(IPC_WORKSPACE_CONTENT_CHANGED_EVENT_CHANNEL, handler),
  onWorkspaceSyncApplied: (handler) => subscribe(IPC_WORKSPACE_SYNC_APPLIED_EVENT_CHANNEL, handler),
  onCompanionPairingRequestsChanged: (handler) => subscribe(IPC_COMPANION_PAIRING_REQUESTS_CHANGED_CHANNEL, handler),
  onExternalDocumentFileOpened: (handler) => subscribe(IPC_EXTERNAL_DOCUMENT_FILE_OPENED_CHANNEL, handler),
  onAssistantTurnEvent: (handler) => subscribe(IPC_ASSISTANT_TURN_EVENT_CHANNEL, handler),
  onDesktopUpdateState: (handler) => subscribe(IPC_DESKTOP_UPDATE_STATE_EVENT_CHANNEL, handler),
  onWindowResized: (handler) => subscribe(IPC_WINDOW_RESIZED_EVENT_CHANNEL, handler),
  runtimeConfig: { guidedSampleLocale: guidedSampleLocaleOverride, systemLanguage },
  setNativeHotkeyRecordingActive: (active) => ipcRenderer.send(IPC_HOTKEY_RECORDER_ACTIVE_CHANNEL, active === true)
};

if (desktopDebugProbeEnabled) {
  electronApi.debug = {
    preloadPath,
    runtimeHead: process.env.FOLIOLE_RUNTIME_HEAD ?? null,
    workspaceDebugBridge: workspaceDebugBridgeEnabled,
    ...(workspaceDebugSeedPersistenceEnabled ? { workspaceDebugSeedPersistence: true } : {})
  };
}

contextBridge.exposeInMainWorld('electronAPI', electronApi);
