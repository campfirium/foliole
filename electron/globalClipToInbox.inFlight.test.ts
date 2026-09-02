// @vitest-environment node

import { beforeEach, expect, it, vi } from 'vitest';

const { clipboardImage, electronMocks } = vi.hoisted(() => {
  const image = { isEmpty: vi.fn(() => true) };
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
      globalShortcut: { register: vi.fn(() => true), unregister: vi.fn() }
    }
  };
});

vi.mock('electron', () => electronMocks);
vi.mock('./diagnostics/mainProcessDiagnostics.js', () => ({ appendMainProcessDiagnosticLog: vi.fn() }));
vi.mock('./database/databaseReadiness.js', () => ({ waitForDatabaseReady: vi.fn(async () => undefined) }));
vi.mock('./ipc/importClipboard.js', () => ({ runClipboardImport: vi.fn(async () => null) }));
vi.mock('./ipc/importTextCapture.js', () => ({ runTextCaptureToInbox: vi.fn(async () => null) }));

import { runGlobalClipToInbox } from './globalClipToInbox.js';

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

beforeEach(() => {
  vi.clearAllMocks();
  clipboardImage.isEmpty.mockReturnValue(true);
});

it('raises the open capture panel when the global shortcut repeats during capture', async () => {
  const panelResult = { type: 'cancelled' as const };
  let resolvePanel!: (value: typeof panelResult) => void;
  const log = vi.fn();
  const raiseCapturePanel = vi.fn(() => true);
  const showCapturePanel = vi.fn(() => new Promise<typeof panelResult>((resolve) => {
    resolvePanel = resolve;
  }));

  const firstRun = runGlobalClipToInbox({
    clipboardRef: createClipboardSnapshotSource('old clipboard'),
    log,
    raiseCapturePanel,
    sendCopyShortcut: vi.fn(async () => false),
    showCapturePanel,
    showDesktopToast: vi.fn(() => ({ close: vi.fn(), update: vi.fn() })),
    waitForReady: vi.fn(async () => undefined)
  });
  for (let index = 0; index < 10 && showCapturePanel.mock.calls.length === 0; index += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }

  await expect(runGlobalClipToInbox({ log, raiseCapturePanel })).resolves.toBeNull();

  expect(showCapturePanel).toHaveBeenCalledTimes(1);
  expect(raiseCapturePanel).toHaveBeenCalledTimes(1);
  expect(log).toHaveBeenCalledWith('global_clip_capture_in_flight');

  resolvePanel(panelResult);
  await expect(firstRun).resolves.toBeNull();
});
