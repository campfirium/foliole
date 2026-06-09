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

function createClipboardSnapshotSource(text: string, formats: string[]) {
  return {
    availableFormats: vi.fn(() => formats),
    readBuffer: vi.fn((format: string) => (formats.includes(format) ? Buffer.from(text) : Buffer.alloc(0))),
    readHTML: vi.fn(() => ''),
    readImage: vi.fn(() => clipboardImage as never),
    readText: vi.fn(() => text)
  };
}

it('opens the capture panel without copying when Windows reports no text selection', async () => {
  const sendCopyShortcut = vi.fn();
  const showCapturePanel = vi.fn(async () => ({ type: 'cancelled' as const }));
  const showDesktopToast = vi.fn();

  await expect(runGlobalClipToInbox({
    clipboardRef: createClipboardSnapshotSource('old clipboard', ['text/plain']),
    detectTextSelection: vi.fn(async () => false),
    log: vi.fn(),
    runImport: vi.fn(),
    sendCopyShortcut,
    showCapturePanel,
    showDesktopToast,
    waitForClipboardChange: vi.fn(async () => true),
    waitForReady: vi.fn(async () => undefined)
  })).resolves.toBeNull();

  expect(sendCopyShortcut).not.toHaveBeenCalled();
  expect(showDesktopToast).not.toHaveBeenCalled();
  expect(showCapturePanel).toHaveBeenCalledTimes(1);
});

it('opens the capture panel without copying when text selection cannot be confirmed', async () => {
  const sendCopyShortcut = vi.fn();
  const showCapturePanel = vi.fn(async () => ({ type: 'cancelled' as const }));

  await expect(runGlobalClipToInbox({
    clipboardRef: createClipboardSnapshotSource('old clipboard', ['text/plain']),
    detectTextSelection: vi.fn(async () => null),
    log: vi.fn(),
    runImport: vi.fn(),
    sendCopyShortcut,
    showCapturePanel,
    showDesktopToast: vi.fn(),
    waitForClipboardChange: vi.fn(async () => true),
    waitForReady: vi.fn(async () => undefined)
  })).resolves.toBeNull();

  expect(sendCopyShortcut).not.toHaveBeenCalled();
  expect(showCapturePanel).toHaveBeenCalledTimes(1);
});

it('opens the capture panel when the changed clipboard is not a strict text selection', async () => {
  const log = vi.fn();
  const runImport = vi.fn();
  const showCapturePanel = vi.fn(async () => ({ type: 'cancelled' as const }));
  const showDesktopToast = vi.fn();

  await expect(runGlobalClipToInbox({
    clipboardRef: createClipboardSnapshotSource('C:\\Users\\me\\Desktop\\image.png', ['FileNameW', 'text/plain']),
    detectTextSelection: vi.fn(async () => true),
    log,
    runImport,
    sendCopyShortcut: vi.fn(async () => true),
    showCapturePanel,
    showDesktopToast,
    waitForClipboardChange: vi.fn(async () => true),
    waitForReady: vi.fn(async () => undefined)
  })).resolves.toBeNull();

  expect(runImport).not.toHaveBeenCalled();
  expect(showDesktopToast).not.toHaveBeenCalled();
  expect(showCapturePanel).toHaveBeenCalledTimes(1);
  expect(log).toHaveBeenCalledWith('global_clip_opening_capture_panel_without_text_selection', {
    formats: ['FileNameW', 'text/plain'],
    hasImage: false,
    hasText: true
  });
});
