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
        clear: vi.fn(),
        readBookmark: vi.fn(() => ({ title: '', url: '' })),
        readBuffer: vi.fn(() => Buffer.alloc(0)),
        readHTML: vi.fn(() => ''),
        readImage: vi.fn(() => image),
        readRTF: vi.fn(() => ''),
        readText: vi.fn(() => ''),
        write: vi.fn()
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
    clear: vi.fn(),
    readBookmark: vi.fn(() => ({ title: '', url: '' })),
    readBuffer: vi.fn((format: string) => (format === 'text/plain' ? Buffer.from(text) : Buffer.alloc(0))),
    readHTML: vi.fn(() => ''),
    readImage: vi.fn(() => clipboardImage as never),
    readRTF: vi.fn(() => ''),
    readText: vi.fn(() => text),
    write: vi.fn()
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

it('imports selected text without opening the capture panel', async () => {
  const runImport = vi.fn(async () => ({
    import_id: 'import-1',
    node_id: 'node-1',
    source_kind: 'text',
    source_name: 'Clipboard preview'
  }));
  const toast = createToastController();
  const showDesktopToast = vi.fn(() => toast);
  const waitForReady = vi.fn(async () => undefined);
  const sendCopyShortcut = vi.fn(async () => true);
  const showCapturePanel = vi.fn(async () => ({ type: 'clipboard' as const }));

  await expect(runGlobalClipToInbox({
    clipboardRef: createClipboardSnapshotSource('new selected text'),
    runImport: runImport as never,
    sendCopyShortcut,
    showCapturePanel,
    showDesktopToast,
    waitForClipboardChange: vi.fn(async () => true),
    waitForReady
  })).resolves.toMatchObject({ import_id: 'import-1' });

  expect(showCapturePanel).not.toHaveBeenCalled();
  expect(sendCopyShortcut).toHaveBeenCalledTimes(1);
  expect(waitForReady).toHaveBeenCalledTimes(1);
  expect(runImport).toHaveBeenCalledTimes(1);
  expect(toast.update).toHaveBeenCalledWith('success', 'node-1', 'Clipboard preview');
});

it('opens the capture panel on macOS when the helper reports no clipboard write', async () => {
  const sendCopyShortcut = vi.fn(async () => true);
  const showCapturePanel = vi.fn(async () => ({ type: 'cancelled' as const }));
  const runMacosCopy = vi.fn(async () => ({ copyWritten: false, permission: 'granted' as const }));

  await runGlobalClipToInbox({
    clipboardRef: createClipboardSnapshotSource('current clipboard'),
    platform: 'darwin',
    runMacosCopy,
    sendCopyShortcut,
    showCapturePanel,
    showDesktopToast: vi.fn(() => createToastController()),
    waitForReady: vi.fn(async () => undefined)
  });

  expect(sendCopyShortcut).not.toHaveBeenCalled();
  expect(runMacosCopy).toHaveBeenCalledTimes(1);
  expect(showCapturePanel).toHaveBeenCalledTimes(1);
});

it('imports on macOS when the helper observes a clipboard write with unchanged content', async () => {
  const runImport = vi.fn(async () => ({
    import_id: 'import-1', node_id: 'node-1', source_kind: 'text', source_name: 'Selection'
  }));
  const showCapturePanel = vi.fn();

  await runGlobalClipToInbox({
    clipboardRef: createClipboardSnapshotSource('same text'),
    platform: 'darwin',
    runImport: runImport as never,
    runMacosCopy: vi.fn(async () => ({ copyWritten: true, permission: 'granted' as const })),
    showCapturePanel,
    showDesktopToast: vi.fn(() => createToastController()),
    waitForReady: vi.fn(async () => undefined)
  });

  expect(runImport).toHaveBeenCalledTimes(1);
  expect(showCapturePanel).not.toHaveBeenCalled();
});

it('imports on macOS when Electron observes a changed fingerprint after the helper returns', async () => {
  const clipboardRef = createClipboardSnapshotSource('before');
  const runImport = vi.fn(async () => ({
    import_id: 'import-1', node_id: 'node-1', source_kind: 'text', source_name: 'Selection'
  }));
  const runMacosCopy = vi.fn(async () => {
    clipboardRef.readText.mockReturnValue('after');
    clipboardRef.readBuffer.mockImplementation((format: string) => (
      format === 'text/plain' ? Buffer.from('after') : Buffer.alloc(0)
    ));
    return { copyWritten: false, permission: 'granted' as const };
  });

  await runGlobalClipToInbox({
    clipboardRef,
    platform: 'darwin',
    runImport: runImport as never,
    runMacosCopy,
    showCapturePanel: vi.fn(),
    showDesktopToast: vi.fn(() => createToastController()),
    waitForReady: vi.fn(async () => undefined)
  });

  expect(runImport).toHaveBeenCalledTimes(1);
});

it('shows permission guidance on macOS when accessibility is denied', async () => {
  const showCapturePanel = vi.fn();
  const showDesktopToast = vi.fn(() => createToastController());

  await runGlobalClipToInbox({
    clipboardRef: createClipboardSnapshotSource('current clipboard'),
    platform: 'darwin',
    runMacosCopy: vi.fn(async () => ({ copyWritten: false, permission: 'denied' as const })),
    showCapturePanel,
    showDesktopToast
  });

  expect(showDesktopToast).toHaveBeenCalledWith('permissionRequired');
  expect(showCapturePanel).not.toHaveBeenCalled();
});
