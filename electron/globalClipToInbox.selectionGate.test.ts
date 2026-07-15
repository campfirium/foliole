// @vitest-environment node

import { expect, it, vi } from 'vitest';

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

import { resolveWindowsCopyCommandForTests, runGlobalClipToInbox } from './globalClipToInbox.js';

function createClipboardSnapshotSource(text: string, formats: string[]) {
  return {
    availableFormats: vi.fn(() => formats),
    clear: vi.fn(),
    readBookmark: vi.fn(() => ({ title: '', url: '' })),
    readBuffer: vi.fn((format: string) => (formats.includes(format) ? Buffer.from(text) : Buffer.alloc(0))),
    readHTML: vi.fn(() => ''),
    readImage: vi.fn(() => clipboardImage as never),
    readRTF: vi.fn(() => ''),
    readText: vi.fn(() => text),
    write: vi.fn()
  };
}

it('tries to copy before opening the capture panel', async () => {
  const sendCopyShortcut = vi.fn(async () => true);
  const showCapturePanel = vi.fn(async () => ({ type: 'cancelled' as const }));
  const waitForClipboardChange = vi.fn(async () => false);

  await expect(runGlobalClipToInbox({
    clipboardRef: createClipboardSnapshotSource('old clipboard', ['text/plain']),
    log: vi.fn(),
    runImport: vi.fn(),
    sendCopyShortcut,
    showCapturePanel,
    showDesktopToast: vi.fn(),
    waitForClipboardChange,
    waitForReady: vi.fn(async () => undefined)
  })).resolves.toBeNull();

  expect(showCapturePanel).toHaveBeenCalledTimes(1);
  expect(sendCopyShortcut).toHaveBeenCalledTimes(1);
  expect(waitForClipboardChange).toHaveBeenCalledTimes(1);
});

it('opens the capture panel when copy cannot be sent', async () => {
  const sendCopyShortcut = vi.fn(async () => false);
  const showCapturePanel = vi.fn(async () => ({ type: 'cancelled' as const }));
  const showDesktopToast = vi.fn();

  await expect(runGlobalClipToInbox({
    clipboardRef: createClipboardSnapshotSource('old clipboard', ['text/plain']),
    log: vi.fn(),
    runImport: vi.fn(),
    sendCopyShortcut,
    showCapturePanel,
    showDesktopToast,
    waitForClipboardChange: vi.fn(async () => true),
    waitForReady: vi.fn(async () => undefined)
  })).resolves.toBeNull();

  expect(sendCopyShortcut).toHaveBeenCalledTimes(1);
  expect(showDesktopToast).not.toHaveBeenCalled();
  expect(showCapturePanel).toHaveBeenCalledTimes(1);
});

it('opens the capture panel when copy leaves the clipboard unchanged', async () => {
  const sendCopyShortcut = vi.fn(async () => true);
  const showCapturePanel = vi.fn(async () => ({ type: 'cancelled' as const }));
  const waitForClipboardChange = vi.fn(async () => false);

  await expect(runGlobalClipToInbox({
    clipboardRef: createClipboardSnapshotSource('old clipboard', ['text/plain']),
    log: vi.fn(),
    runImport: vi.fn(),
    sendCopyShortcut,
    showCapturePanel,
    showDesktopToast: vi.fn(),
    waitForClipboardChange,
    waitForReady: vi.fn(async () => undefined)
  })).resolves.toBeNull();

  expect(sendCopyShortcut).toHaveBeenCalledTimes(1);
  expect(waitForClipboardChange).toHaveBeenCalledTimes(1);
  expect(showCapturePanel).toHaveBeenCalledTimes(1);
});

it.each([
  ['HTML / rich text', ['text/html', 'text/plain']],
  ['files', ['FileNameW', 'text/plain']]
])('imports copied %s through the complete clipboard importer', async (_label, formats) => {
  const log = vi.fn();
  const runImport = vi.fn(async () => ({
    import_id: 'import-1', node_id: 'node-1', source_kind: 'clipboard', source_name: 'Selection'
  }));
  const showCapturePanel = vi.fn(async () => ({ type: 'cancelled' as const }));
  const toast = { close: vi.fn(), update: vi.fn() };
  const showDesktopToast = vi.fn(() => toast);
  const sendCopyShortcut = vi.fn(async () => true);
  const waitForClipboardChange = vi.fn(async () => true);

  await expect(runGlobalClipToInbox({
    clipboardRef: createClipboardSnapshotSource('copied content', formats),
    log,
    runImport: runImport as never,
    sendCopyShortcut,
    showCapturePanel,
    showDesktopToast,
    waitForClipboardChange,
    waitForReady: vi.fn(async () => undefined)
  })).resolves.toMatchObject({ import_id: 'import-1' });

  expect(sendCopyShortcut).toHaveBeenCalledTimes(1);
  expect(waitForClipboardChange).toHaveBeenCalledTimes(1);
  expect(runImport).toHaveBeenCalledTimes(1);
  expect(showDesktopToast).toHaveBeenCalledWith('pending');
  expect(showCapturePanel).not.toHaveBeenCalled();
  expect(log).not.toHaveBeenCalledWith('global_clip_opening_capture_panel');
});

it('imports copied images without opening the capture panel', async () => {
  clipboardImage.isEmpty.mockReturnValue(false);
  const runImport = vi.fn(async () => ({
    import_id: 'import-1', node_id: 'node-1', source_kind: 'image', source_name: 'Image'
  }));
  const showCapturePanel = vi.fn(async () => ({ type: 'cancelled' as const }));

  await runGlobalClipToInbox({
    clipboardRef: createClipboardSnapshotSource('', ['image/png']),
    runImport: runImport as never,
    sendCopyShortcut: vi.fn(async () => true),
    showCapturePanel,
    showDesktopToast: vi.fn(() => ({ close: vi.fn(), update: vi.fn() })),
    waitForClipboardChange: vi.fn(async () => true),
    waitForReady: vi.fn(async () => undefined)
  });

  expect(runImport).toHaveBeenCalledTimes(1);
  expect(showCapturePanel).not.toHaveBeenCalled();
});

it('uses native Windows key events instead of WinForms SendKeys for copy', () => {
  const command = resolveWindowsCopyCommandForTests();

  expect(command).toContain('user32.dll');
  expect(command).toContain('keybd_event');
  expect(command).toContain('$alt = 0x12');
  expect(command).toContain('$shift = 0x10');
  expect(command.indexOf('keybd_event($alt, 0, $up, $zero)')).toBeLessThan(command.indexOf('keybd_event($ctrl, 0, 0, $zero)'));
  expect(command.indexOf('keybd_event($shift, 0, $up, $zero)')).toBeLessThan(command.indexOf('keybd_event($ctrl, 0, 0, $zero)'));
  expect(command).not.toContain('System.Windows.Forms');
  expect(command).not.toContain('SendKeys');
});
