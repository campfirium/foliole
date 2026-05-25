import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

import { expect, it, vi } from 'vitest';

const PRELOAD_PATH = path.resolve(process.cwd(), 'electron', 'preload.cjs');

function executePreload(env: Record<string, string | undefined> = {}) {
  const source = readFileSync(PRELOAD_PATH, 'utf8');
  const exposeInMainWorld = vi.fn();
  const ipcInvoke = vi.fn();
  const ipcOn = vi.fn();
  const ipcRemoveListener = vi.fn();
  const sandboxRequire = vi.fn((specifier: string) => {
    if (specifier === 'electron') {
      return {
        contextBridge: { exposeInMainWorld },
        ipcRenderer: {
          invoke: ipcInvoke,
          on: ipcOn,
          removeListener: ipcRemoveListener,
          send: vi.fn()
        }
      };
    }

    throw new Error(`unsupported require: ${specifier}`);
  });

  const sandbox = {
    __dirname: path.dirname(PRELOAD_PATH),
    __filename: PRELOAD_PATH,
    exports: {},
    module: { exports: {} },
    process: { env },
    require: sandboxRequire
  };

  vm.runInNewContext(source, sandbox, { filename: PRELOAD_PATH });

  return {
    exposeInMainWorld,
    ipcInvoke,
    ipcOn,
    ipcRemoveListener,
    sandboxRequire
  };
}

const readwiseIndexProgressPayload = {
  currentSourcePath: 'High Fanout.md',
  indexFailedCount: 0,
  indexElapsedMs: 1200,
  indexPendingCount: 12,
  indexProcessedCount: 8,
  indexTotalCount: 20,
  phase: 'indexing',
  processedCount: 0,
  sourceProcessedCount: 9,
  sourceTotalCount: 100,
  status: 'running',
  totalCount: 3
};

const sanitizedReadwiseIndexProgressPayload = {
  currentSourcePath: 'High Fanout.md',
  highlightProcessedCount: undefined,
  highlightTotalCount: undefined,
  importWriteElapsedMs: undefined,
  indexFailedCount: 0,
  indexElapsedMs: 1200,
  indexPendingCount: 12,
  indexProcessedCount: 8,
  indexTotalCount: 20,
  phase: 'indexing',
  processedCount: 0,
  sourceProcessedCount: 9,
  sourceTotalCount: 100,
  status: 'running',
  totalCount: 3
};

const sanitizedCompletedReadwiseProgressPayload = {
  currentSourcePath: null,
  highlightProcessedCount: undefined,
  highlightTotalCount: undefined,
  importWriteElapsedMs: undefined,
  indexFailedCount: undefined,
  indexElapsedMs: undefined,
  indexPendingCount: undefined,
  indexProcessedCount: undefined,
  indexTotalCount: undefined,
  phase: undefined,
  processedCount: 3,
  sourceProcessedCount: undefined,
  sourceTotalCount: undefined,
  status: 'completed',
  totalCount: 3
};

  it('boots under sandbox-limited require and exposes the bridge API', () => {
    const { exposeInMainWorld } = executePreload();

    expect(exposeInMainWorld).toHaveBeenCalledTimes(1);
    expect(exposeInMainWorld).toHaveBeenCalledWith(
      'electronAPI',
      expect.objectContaining({
        invoke: expect.any(Function),
        logDiagnosticEvent: expect.any(Function),
        onManagedInboxUpdated: expect.any(Function),
        onNativeKeyboardInput: expect.any(Function),
        onNativeMenuCommand: expect.any(Function),
        onCompanionPairingRequestsChanged: expect.any(Function),
        onExternalDocumentFileOpened: expect.any(Function),
        onReadwiseReaderImportProgress: expect.any(Function),
        onWorkspaceContentChanged: expect.any(Function),
        onWorkspaceSyncApplied: expect.any(Function),
        onWindowResized: expect.any(Function),
        setNativeHotkeyRecordingActive: expect.any(Function)
      })
    );
  });

  it('exposes a working bridge without touching unsupported preload require helpers', () => {
    const { exposeInMainWorld, ipcInvoke, sandboxRequire } = executePreload();

    const electronApi = exposeInMainWorld.mock.calls[0]?.[1];
    electronApi.invoke('boot:ping', { probe: true });

    expect(sandboxRequire).toHaveBeenCalledTimes(1);
    expect(sandboxRequire).toHaveBeenCalledWith('electron');
    expect(sandboxRequire).not.toHaveProperty('resolve');
    expect(ipcInvoke).toHaveBeenCalledWith('foliole:invoke', {
      command: 'boot:ping',
      args: { probe: true }
    });
  });

  it('forwards diagnostic log events through the dedicated diagnostics channel', () => {
    const { exposeInMainWorld, ipcInvoke } = executePreload();

    const electronApi = exposeInMainWorld.mock.calls[0]?.[1];
    electronApi.logDiagnosticEvent({
      event: 'bridge_unavailable',
      level: 'warn',
      payload: { action: 'resolve_runtime_app_paths' },
      source: 'renderer.bridge'
    });

    expect(ipcInvoke).toHaveBeenCalledWith('foliole:diagnostics:log-event', {
      event: 'bridge_unavailable',
      level: 'warn',
      payload: { action: 'resolve_runtime_app_paths' },
      source: 'renderer.bridge'
    });
  });


  it('exposes native keyboard input subscription and recorder active bridge', () => {
    const { exposeInMainWorld, ipcOn, ipcRemoveListener } = executePreload();
    const electronApi = exposeInMainWorld.mock.calls[0]?.[1];
    const handler = vi.fn();

    const unsubscribe = electronApi.onNativeKeyboardInput(handler);
    const listener = ipcOn.mock.calls[0]?.[1];
    listener({}, { altKey: true, code: 'KeyG', controlKey: true, key: 'g', metaKey: false, shiftKey: false, type: 'keyDown' });
    unsubscribe();

    expect(ipcOn).toHaveBeenCalledWith('foliole:native-keyboard-input', expect.any(Function));
    expect(handler).toHaveBeenCalledWith({ altKey: true, code: 'KeyG', controlKey: true, key: 'g', metaKey: false, shiftKey: false, type: 'keyDown' });
    expect(ipcRemoveListener).toHaveBeenCalledWith('foliole:native-keyboard-input', listener);
  });

  it('forwards sanitized workspace sync applied events through preload', () => {
    const { exposeInMainWorld, ipcOn } = executePreload();
    const electronApi = exposeInMainWorld.mock.calls[0]?.[1];
    const handler = vi.fn();

    electronApi.onWorkspaceSyncApplied(handler);
    const listener = ipcOn.mock.calls[0]?.[1];
    listener({}, {
      appliedNodeIds: ['node-1', 1],
      appliedObjectIds: ['node_reading:node-1'],
      appliedReviewOpIds: [null, 'op-1']
    });

    expect(ipcOn).toHaveBeenCalledWith('foliole:workspace-sync-applied', expect.any(Function));
    expect(handler).toHaveBeenCalledWith({
      appliedNodeIds: ['node-1'],
      appliedObjectIds: ['node_reading:node-1'],
      appliedReviewOpIds: ['op-1']
    });
  });

  it('forwards sanitized workspace content changed events through preload', () => {
    const { exposeInMainWorld, ipcOn } = executePreload();
    const electronApi = exposeInMainWorld.mock.calls[0]?.[1];
    const handler = vi.fn();

    electronApi.onWorkspaceContentChanged(handler);
    const listener = ipcOn.mock.calls[0]?.[1];
    listener({}, { scope: 'workspace', ignored: 'value' });
    listener({}, { scope: 'other' });

    expect(ipcOn).toHaveBeenCalledWith('foliole:workspace-content-changed', expect.any(Function));
    expect(handler).toHaveBeenNthCalledWith(1, { scope: 'workspace' });
    expect(handler).toHaveBeenNthCalledWith(2, { scope: '' });
  });

  it('forwards sanitized Readwise Reader import progress events through preload', () => {
    const { exposeInMainWorld, ipcOn } = executePreload();
    const electronApi = exposeInMainWorld.mock.calls[0]?.[1];
    const handler = vi.fn();

    electronApi.onReadwiseReaderImportProgress(handler);
    const listener = ipcOn.mock.calls[0]?.[1];
    listener({}, readwiseIndexProgressPayload);
    listener({}, { processedCount: -1, status: 'running', totalCount: 3 });
    listener({}, { processedCount: 4, status: 'running', totalCount: 3 });
    listener({}, { processedCount: 1, status: 'paused', totalCount: 3 });
    listener({}, { processedCount: 3, status: 'completed', totalCount: 3 });

    expect(ipcOn).toHaveBeenCalledWith(
      'foliole:readwise-reader-import-progress',
      expect.any(Function)
    );
    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler).toHaveBeenNthCalledWith(1, sanitizedReadwiseIndexProgressPayload);
    expect(handler).toHaveBeenNthCalledWith(2, sanitizedCompletedReadwiseProgressPayload);
  });

  it('sends native hotkey recorder active state through preload', () => {
    const { exposeInMainWorld, sandboxRequire } = executePreload();
    const electronApi = exposeInMainWorld.mock.calls[0]?.[1];
    const ipcRenderer = sandboxRequire.mock.results[0]?.value.ipcRenderer;

    electronApi.setNativeHotkeyRecordingActive(true);

    expect(ipcRenderer.send).toHaveBeenCalledWith('foliole:hotkey-recorder-active', true);
  });

  it('keeps debug metadata when desktop debug probe is enabled', () => {
    const { exposeInMainWorld } = executePreload({
      ELECTRON_RENDERER_URL: 'http://127.0.0.1:24600/',
      FOLIOLE_RUNTIME_HEAD: 'head-123'
    });

    const electronApi = exposeInMainWorld.mock.calls[0]?.[1];
    expect(electronApi.debug).toEqual({
      preloadPath: PRELOAD_PATH,
      runtimeHead: 'head-123',
      workspaceDebugBridge: false
    });
  });
