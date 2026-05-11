/* global __filename, process */

const { contextBridge, ipcRenderer } = require('electron');

const preloadPath = typeof __filename === 'string' ? __filename : null;

const IPC_INVOKE_CHANNEL = 'foliole:invoke';
const IPC_DIAGNOSTIC_LOG_CHANNEL = 'foliole:diagnostics:log-event';
const IPC_MANAGED_INBOX_UPDATED_EVENT_CHANNEL = 'foliole:managed-inbox-updated';
const IPC_MENU_EVENT_CHANNEL = 'foliole:native-menu-command';
const IPC_READWISE_BOOK_EPUB_PROGRESS_EVENT_CHANNEL = 'foliole:readwise-book-epub-progress';
const IPC_WORKSPACE_CONTENT_CHANGED_EVENT_CHANNEL = 'foliole:workspace-content-changed';
const IPC_WORKSPACE_SYNC_APPLIED_EVENT_CHANNEL = 'foliole:workspace-sync-applied';
const IPC_WINDOW_RESIZED_EVENT_CHANNEL = 'foliole:window-resized';
const IPC_HOTKEY_RECORDER_ACTIVE_CHANNEL = 'foliole:hotkey-recorder-active';
const IPC_NATIVE_KEYBOARD_INPUT_EVENT_CHANNEL = 'foliole:native-keyboard-input';
const IPC_COMPANION_PAIRING_REQUESTS_CHANGED_CHANNEL = 'foliole:companion-pairing-requests-changed';

function isDesktopDebugProbeEnabled() {
  return process.env.FOLIOLE_ENABLE_DESKTOP_DEBUG_PROBE === '1' || Boolean(process.env.ELECTRON_RENDERER_URL);
}

function subscribe(channel, handler) {
  if (
    channel !== IPC_MANAGED_INBOX_UPDATED_EVENT_CHANNEL &&
    channel !== IPC_MENU_EVENT_CHANNEL &&
    channel !== IPC_READWISE_BOOK_EPUB_PROGRESS_EVENT_CHANNEL &&
    channel !== IPC_WORKSPACE_CONTENT_CHANGED_EVENT_CHANNEL &&
    channel !== IPC_WORKSPACE_SYNC_APPLIED_EVENT_CHANNEL &&
    channel !== IPC_WINDOW_RESIZED_EVENT_CHANNEL &&
    channel !== IPC_NATIVE_KEYBOARD_INPUT_EVENT_CHANNEL &&
    channel !== IPC_COMPANION_PAIRING_REQUESTS_CHANGED_CHANNEL
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
    if (channel === IPC_READWISE_BOOK_EPUB_PROGRESS_EVENT_CHANNEL) {
      handler({
        detail: payload?.detail ?? '',
        nodeId: payload?.nodeId ?? '',
        phase: payload?.phase ?? '',
        progress: typeof payload?.progress === 'number' ? payload.progress : 0
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
  onWorkspaceContentChanged: (handler) => subscribe(IPC_WORKSPACE_CONTENT_CHANGED_EVENT_CHANNEL, handler),
  onWorkspaceSyncApplied: (handler) => subscribe(IPC_WORKSPACE_SYNC_APPLIED_EVENT_CHANNEL, handler),
  onCompanionPairingRequestsChanged: (handler) => subscribe(IPC_COMPANION_PAIRING_REQUESTS_CHANGED_CHANNEL, handler),
  onWindowResized: (handler) => subscribe(IPC_WINDOW_RESIZED_EVENT_CHANNEL, handler),
  setNativeHotkeyRecordingActive: (active) => ipcRenderer.send(IPC_HOTKEY_RECORDER_ACTIVE_CHANNEL, active === true)
};

if (isDesktopDebugProbeEnabled()) {
  electronApi.debug = {
    preloadPath,
    runtimeHead: process.env.FOLIOLE_RUNTIME_HEAD ?? null
  };
}

contextBridge.exposeInMainWorld('electronAPI', electronApi);
