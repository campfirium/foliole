// @vitest-environment node

import { beforeEach, expect, it, vi } from 'vitest';

const { clipboardImage, electronMocks } = vi.hoisted(() => {
  const image = {
    isEmpty: vi.fn(() => true)
  };
  return {
    clipboardImage: image,
    electronMocks: {
      app: { on: vi.fn() },
      clipboard: {
        availableFormats: vi.fn(() => []),
        readBuffer: vi.fn(() => Buffer.alloc(0)),
        readHTML: vi.fn(() => ''),
        readImage: vi.fn(() => image),
        readText: vi.fn(() => '')
      },
      globalShortcut: {
        register: vi.fn(() => true),
        unregister: vi.fn()
      },
      BrowserWindow: Object.assign(vi.fn(function BrowserWindow() {
        return {};
      }), { getAllWindows: vi.fn(() => []) }),
      nativeTheme: {
        shouldUseDarkColors: false
      },
      Notification: vi.fn(),
      screen: {
        getPrimaryDisplay: vi.fn(() => ({
          workArea: { height: 900, width: 1400, x: 0, y: 0 }
        }))
      }
    }
  };
});

vi.mock('electron', () => electronMocks);
vi.mock('./diagnostics/mainProcessDiagnostics.js', () => ({ appendMainProcessDiagnosticLog: vi.fn() }));
vi.mock('./database/databaseReadiness.js', () => ({ waitForDatabaseReady: vi.fn(async () => undefined) }));
vi.mock('./ipc/importClipboard.js', () => ({ runClipboardImport: vi.fn(async () => null) }));
vi.mock('./ipc/importTextCapture.js', () => ({ runTextCaptureToInbox: vi.fn(async () => null) }));

import { runGlobalClipToInbox } from './globalClipToInbox.js';
import { runTextCaptureToInbox } from './ipc/importTextCapture.js';

function createClipboardSnapshotSource(text: string) {
  return {
    availableFormats: vi.fn(() => ['text/plain']),
    readBuffer: vi.fn((format: string) => (format === 'text/plain' ? Buffer.from(text) : Buffer.alloc(0))),
    readHTML: vi.fn(() => ''),
    readImage: vi.fn(() => clipboardImage as never),
    readText: vi.fn(() => text)
  };
}

function createToastController() {
  return {
    close: vi.fn(),
    update: vi.fn()
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  clipboardImage.isEmpty.mockReturnValue(true);
  electronMocks.BrowserWindow.getAllWindows = vi.fn(() => []);
  electronMocks.nativeTheme.shouldUseDarkColors = false;
  electronMocks.globalShortcut.register.mockReturnValue(true);
});

it('opens the capture panel when the copy shortcut does not change the clipboard', async () => {
  const runImport = vi.fn();
  const toast = createToastController();
  const showDesktopToast = vi.fn(() => toast);
  const showCapturePanel = vi.fn(async () => ({ type: 'cancelled' as const }));

  await expect(runGlobalClipToInbox({
    clipboardRef: createClipboardSnapshotSource('old clipboard'),
    detectTextSelection: vi.fn(async () => true),
    runImport,
    sendCopyShortcut: vi.fn(async () => true),
    showCapturePanel,
    showDesktopToast,
    waitForClipboardChange: vi.fn(async () => false),
    waitForReady: vi.fn(async () => undefined)
  })).resolves.toBeNull();

  expect(runImport).not.toHaveBeenCalled();
  expect(showDesktopToast).not.toHaveBeenCalled();
  expect(toast.close).not.toHaveBeenCalled();
  expect(showCapturePanel).toHaveBeenCalledTimes(1);
});

it('imports the current clipboard when the capture panel is submitted empty', async () => {
  const runImport = vi.fn(async () => ({
    import_id: 'import-1',
    node_id: 'node-1',
    source_kind: 'markdown',
    source_name: 'Clipboard preview'
  }));
  const toast = createToastController();
  const showDesktopToast = vi.fn(() => toast);

  await expect(runGlobalClipToInbox({
    clipboardRef: createClipboardSnapshotSource('old clipboard'),
    runImport: runImport as never,
    sendCopyShortcut: vi.fn(async () => true),
    showCapturePanel: vi.fn(async () => ({ type: 'clipboard' as const })),
    showDesktopToast,
    waitForClipboardChange: vi.fn(async () => false),
    waitForReady: vi.fn(async () => undefined)
  })).resolves.toMatchObject({ import_id: 'import-1' });

  expect(runImport).toHaveBeenCalledTimes(1);
  expect(showDesktopToast).toHaveBeenCalledTimes(1);
  expect(toast.update).toHaveBeenCalledWith('success', 'node-1', 'Clipboard preview');
});

it('captures typed panel text without importing the clipboard', async () => {
  const runImport = vi.fn();
  const toast = createToastController();

  await expect(runGlobalClipToInbox({
    clipboardRef: createClipboardSnapshotSource('old clipboard'),
    runImport,
    sendCopyShortcut: vi.fn(async () => true),
    showDesktopToast: vi.fn(() => toast),
    showCapturePanel: vi.fn(async () => ({ text: 'quick thought', type: 'text' as const })),
    waitForClipboardChange: vi.fn(async () => false),
    waitForReady: vi.fn(async () => undefined)
  })).resolves.toBeNull();

  expect(runImport).not.toHaveBeenCalled();
  expect(runTextCaptureToInbox).toHaveBeenCalledWith('quick thought');
});

it('imports and notifies when the copy shortcut changes to importable clipboard content', async () => {
  const runImport = vi.fn(async () => ({
    import_id: 'import-1',
    node_id: 'node-1',
    source_kind: 'text',
    source_name: 'Selected text preview'
  }));
  const toast = createToastController();
  const showDesktopToast = vi.fn(() => toast);
  const waitForReady = vi.fn(async () => undefined);
  const sendCopyShortcut = vi.fn(async () => {
    expect(showDesktopToast).not.toHaveBeenCalled();
    expect(toast.update).not.toHaveBeenCalled();
    return true;
  });

  await expect(runGlobalClipToInbox({
    clipboardRef: createClipboardSnapshotSource('new selected text'),
    detectTextSelection: vi.fn(async () => true),
    runImport: runImport as never,
    sendCopyShortcut,
    showDesktopToast,
    waitForClipboardChange: vi.fn(async () => true),
    waitForReady
  })).resolves.toMatchObject({ import_id: 'import-1' });

  expect(waitForReady).toHaveBeenCalledTimes(1);
  expect(runImport).toHaveBeenCalledTimes(1);
  expect(toast.update).toHaveBeenCalledWith('success', 'node-1', 'Selected text preview');
});

it('shows an empty result when changed clipboard content is not importable', async () => {
  const log = vi.fn();
  const toast = createToastController();

  await expect(runGlobalClipToInbox({
    clipboardRef: createClipboardSnapshotSource('new selected text'),
    detectTextSelection: vi.fn(async () => true),
    log,
    runImport: vi.fn(async () => null),
    sendCopyShortcut: vi.fn(async () => true),
    showDesktopToast: vi.fn(() => toast),
    waitForClipboardChange: vi.fn(async () => true),
    waitForReady: vi.fn(async () => undefined)
  })).resolves.toBeNull();

  expect(log).toHaveBeenCalledWith('global_clip_import_empty');
  expect(toast.update).toHaveBeenCalledWith('empty');
});

it('shows a failure result when copy cannot be sent', async () => {
  const log = vi.fn();
  const runImport = vi.fn();
  const toast = createToastController();

  await expect(runGlobalClipToInbox({
    clipboardRef: createClipboardSnapshotSource('new selected text'),
    detectTextSelection: vi.fn(async () => true),
    log,
    runImport,
    sendCopyShortcut: vi.fn(async () => false),
    showDesktopToast: vi.fn(() => toast),
    waitForClipboardChange: vi.fn(async () => true),
    waitForReady: vi.fn(async () => undefined)
  })).resolves.toBeNull();

  expect(log).toHaveBeenCalledWith('global_clip_copy_not_sent');
  expect(runImport).not.toHaveBeenCalled();
  expect(toast.update).toHaveBeenCalledWith('copyFailed');
});

it('shows a failure result when database readiness fails', async () => {
  const log = vi.fn();
  const runImport = vi.fn();
  const toast = createToastController();

  await expect(runGlobalClipToInbox({
    clipboardRef: createClipboardSnapshotSource('new selected text'),
    detectTextSelection: vi.fn(async () => true),
    log,
    runImport,
    sendCopyShortcut: vi.fn(async () => true),
    showDesktopToast: vi.fn(() => toast),
    waitForClipboardChange: vi.fn(async () => true),
    waitForReady: vi.fn(async () => {
      throw new Error('database unavailable');
    })
  })).resolves.toBeNull();

  expect(log).toHaveBeenCalledWith('global_clip_database_not_ready', { error: expect.any(Error) });
  expect(runImport).not.toHaveBeenCalled();
  expect(toast.update).toHaveBeenCalledWith('importFailed');
});

it('logs import errors and shows a failure result', async () => {
  const log = vi.fn();
  const toast = createToastController();

  await expect(runGlobalClipToInbox({
    clipboardRef: createClipboardSnapshotSource('new selected text'),
    detectTextSelection: vi.fn(async () => true),
    log,
    runImport: vi.fn(async () => {
      throw new Error('unsupported clipboard content');
    }),
    sendCopyShortcut: vi.fn(async () => true),
    showDesktopToast: vi.fn(() => toast),
    waitForClipboardChange: vi.fn(async () => true),
    waitForReady: vi.fn(async () => undefined)
  })).resolves.toBeNull();

  expect(log).toHaveBeenCalledWith('global_clip_import_failed', { error: expect.any(Error) });
  expect(toast.update).toHaveBeenCalledWith('importFailed');
});
