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

import { hasClipboardChanged, readClipboardSnapshot } from './globalClipClipboardEvidence.js';
import { runGlobalClipToInbox } from './globalClipToInbox.js';

function createClipboardSource(initialText: string, initialFormats = ['text/plain']) {
  const state = { formats: initialFormats, text: initialText };
  return {
    state,
    source: {
      availableFormats: vi.fn(() => state.formats),
      clear: vi.fn(() => {
        state.formats = [];
        state.text = '';
      }),
      readBookmark: vi.fn(() => ({ title: '', url: '' })),
      readBuffer: vi.fn((format: string) => (state.formats.includes(format) ? Buffer.from(state.text) : Buffer.alloc(0))),
      readHTML: vi.fn(() => ''),
      readImage: vi.fn(() => clipboardImage as never),
      readRTF: vi.fn(() => ''),
      readText: vi.fn(() => state.text),
      write: vi.fn((data: { text?: string }) => {
        state.text = data.text ?? '';
        state.formats = state.text ? ['text/plain'] : [];
      })
    }
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
  clipboardImage.isEmpty.mockReturnValue(true);
});

it('detects payload changes when a direct custom MIME type stays the same', async () => {
  const state = { payload: 'first' };
  const source = {
    availableFormats: vi.fn(() => ['web application/x-foliole-test']),
    readBookmark: vi.fn(() => ({ title: '', url: '' })),
    readBuffer: vi.fn(() => Buffer.from(state.payload)),
    readHTML: vi.fn(() => ''),
    readImage: vi.fn(() => clipboardImage as never),
    readRTF: vi.fn(() => ''),
    readText: vi.fn(() => '')
  };

  const before = await readClipboardSnapshot(source);
  state.payload = 'second';
  const after = await readClipboardSnapshot(source);

  expect(hasClipboardChanged(before, after)).toBe(true);
});

it('restores the original clipboard after strict text import succeeds', async () => {
  const clipboard = createClipboardSource('old clipboard');

  await expect(runGlobalClipToInbox({
    clipboardRef: clipboard.source,
    runImport: vi.fn(async () => ({ import_id: 'import-1', node_id: 'node-1', source_kind: 'text', source_name: 'Selection' })) as never,
    sendCopyShortcut: vi.fn(async () => true),
    showCapturePanel: vi.fn(async () => ({ type: 'cancelled' as const })),
    showDesktopToast: vi.fn(() => createToastController()),
    waitForClipboardChange: vi.fn(async () => {
      clipboard.state.text = 'selected text';
      return true;
    }),
    waitForReady: vi.fn(async () => undefined)
  })).resolves.toMatchObject({ import_id: 'import-1' });

  expect(clipboard.source.clear).toHaveBeenCalledTimes(1);
  expect(clipboard.source.write).toHaveBeenCalledWith({ text: 'old clipboard' });
  expect(clipboard.state.text).toBe('old clipboard');
});

it('restores the original clipboard when strict text import fails', async () => {
  const clipboard = createClipboardSource('old clipboard');

  await expect(runGlobalClipToInbox({
    clipboardRef: clipboard.source,
    log: vi.fn(),
    runImport: vi.fn(async () => {
      throw new Error('import failed');
    }),
    sendCopyShortcut: vi.fn(async () => true),
    showCapturePanel: vi.fn(async () => ({ type: 'cancelled' as const })),
    showDesktopToast: vi.fn(() => createToastController()),
    waitForClipboardChange: vi.fn(async () => {
      clipboard.state.text = 'selected text';
      return true;
    }),
    waitForReady: vi.fn(async () => undefined)
  })).resolves.toBeNull();

  expect(clipboard.state.text).toBe('old clipboard');
});

it('restores after capture panel clipboard import and cancellation', async () => {
  for (const panelResult of [{ type: 'clipboard' as const }, { type: 'cancelled' as const }]) {
    const clipboard = createClipboardSource('old clipboard');

    await runGlobalClipToInbox({
      clipboardRef: clipboard.source,
      log: vi.fn(),
      runImport: vi.fn(async () => ({ import_id: 'import-1', node_id: 'node-1', source_kind: 'text', source_name: 'Selection' })) as never,
      sendCopyShortcut: vi.fn(async () => true),
      showCapturePanel: vi.fn(async () => panelResult),
      showDesktopToast: vi.fn(() => createToastController()),
      waitForClipboardChange: vi.fn(async () => {
        clipboard.state.formats = ['FileNameW', 'text/plain'];
        clipboard.state.text = 'selected text';
        return true;
      }),
      waitForReady: vi.fn(async () => undefined)
    });

    expect(clipboard.state.text).toBe('old clipboard');
  }
});

it('does not restore when copy leaves the clipboard unchanged', async () => {
  const clipboard = createClipboardSource('old clipboard');

  await runGlobalClipToInbox({
    clipboardRef: clipboard.source,
    log: vi.fn(),
    runImport: vi.fn(),
    sendCopyShortcut: vi.fn(async () => true),
    showCapturePanel: vi.fn(async () => ({ type: 'cancelled' as const })),
    showDesktopToast: vi.fn(() => createToastController()),
    waitForClipboardChange: vi.fn(async () => false),
    waitForReady: vi.fn(async () => undefined)
  });

  expect(clipboard.source.clear).not.toHaveBeenCalled();
  expect(clipboard.source.write).not.toHaveBeenCalled();
  expect(clipboard.state.text).toBe('old clipboard');
});

it('skips restore when the clipboard changed after synthetic copy', async () => {
  const clipboard = createClipboardSource('old clipboard');
  const log = vi.fn();

  await runGlobalClipToInbox({
    clipboardRef: clipboard.source,
    log,
    runImport: vi.fn(async () => {
      clipboard.state.text = 'manual copy';
      return null;
    }),
    sendCopyShortcut: vi.fn(async () => true),
    showCapturePanel: vi.fn(async () => ({ type: 'cancelled' as const })),
    showDesktopToast: vi.fn(() => createToastController()),
    waitForClipboardChange: vi.fn(async () => {
      clipboard.state.formats = ['FileNameW', 'text/plain'];
      clipboard.state.text = 'selected text';
      return true;
    }),
    waitForReady: vi.fn(async () => undefined)
  });

  expect(clipboard.source.clear).not.toHaveBeenCalled();
  expect(clipboard.source.write).not.toHaveBeenCalled();
  expect(clipboard.state.text).toBe('manual copy');
  expect(log).toHaveBeenCalledWith('global_clip_clipboard_restore_skipped_changed');
});
