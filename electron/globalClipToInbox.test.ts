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

import { installGlobalClipToInboxShortcut, runGlobalClipToInbox } from './globalClipToInbox.js';

function createClipboardSnapshotSource(text: string) {
  return {
    availableFormats: vi.fn(() => ['text/plain']),
    readBuffer: vi.fn((format: string) => (format === 'text/plain' ? Buffer.from(text) : Buffer.alloc(0))),
    readHTML: vi.fn(() => ''),
    readImage: vi.fn(() => clipboardImage as never),
    readText: vi.fn(() => text)
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

it('registers and unregisters the Windows global clip shortcut', () => {
  const appRef = { on: vi.fn() };
  const globalShortcutRef = {
    register: vi.fn(() => true),
    unregister: vi.fn()
  };

  expect(installGlobalClipToInboxShortcut({
    appRef,
    globalShortcutRef,
    platform: 'win32'
  })).toBe(true);

  expect(globalShortcutRef.register).toHaveBeenCalledWith('Control+Alt+C', expect.any(Function));
  const willQuit = appRef.on.mock.calls.find(([event]) => event === 'will-quit')?.[1] as (() => void) | undefined;
  expect(willQuit).toBeTypeOf('function');
  willQuit?.();
  expect(globalShortcutRef.unregister).toHaveBeenCalledWith('Control+Alt+C');
});

it('does not register outside Windows', () => {
  const globalShortcutRef = {
    register: vi.fn(() => true),
    unregister: vi.fn()
  };

  expect(installGlobalClipToInboxShortcut({
    globalShortcutRef,
    platform: 'linux'
  })).toBe(false);

  expect(globalShortcutRef.register).not.toHaveBeenCalled();
});

it('logs shortcut registration failure without throwing', () => {
  const log = vi.fn();
  const globalShortcutRef = {
    register: vi.fn(() => false),
    unregister: vi.fn()
  };

  expect(installGlobalClipToInboxShortcut({
    globalShortcutRef,
    log,
    platform: 'win32'
  })).toBe(false);

  expect(log).toHaveBeenCalledWith('global_clip_shortcut_registration_failed', { shortcut: 'Control+Alt+C' });
});

it('imports the current clipboard when the copy shortcut does not change the clipboard', async () => {
  const runImport = vi.fn(async () => ({
    import_id: 'import-1',
    node_id: 'node-1',
    source_kind: 'markdown'
  }));
  const showDesktopToast = vi.fn();

  await expect(runGlobalClipToInbox({
    clipboardRef: createClipboardSnapshotSource('old clipboard'),
    runImport: runImport as never,
    sendCopyShortcut: vi.fn(async () => true),
    showDesktopToast,
    shouldImportExistingClipboard: vi.fn(() => true),
    waitForClipboardChange: vi.fn(async () => false),
    waitForReady: vi.fn(async () => undefined)
  })).resolves.toMatchObject({ import_id: 'import-1' });

  expect(runImport).toHaveBeenCalledTimes(1);
  expect(showDesktopToast).toHaveBeenCalledTimes(1);
});

it('does not import unchanged clipboard content when existing clipboard fallback is off', async () => {
  const runImport = vi.fn();

  await expect(runGlobalClipToInbox({
    clipboardRef: createClipboardSnapshotSource('old clipboard'),
    runImport,
    sendCopyShortcut: vi.fn(async () => true),
    shouldImportExistingClipboard: vi.fn(() => false),
    waitForClipboardChange: vi.fn(async () => false),
    waitForReady: vi.fn(async () => undefined)
  })).resolves.toBeNull();

  expect(runImport).not.toHaveBeenCalled();
});

it('imports and notifies when the copy shortcut changes to importable clipboard content', async () => {
  const runImport = vi.fn(async () => ({
    import_id: 'import-1',
    node_id: 'node-1',
    source_kind: 'text'
  }));
  const showDesktopToast = vi.fn();
  const waitForReady = vi.fn(async () => undefined);

  await expect(runGlobalClipToInbox({
    clipboardRef: createClipboardSnapshotSource('new selected text'),
    runImport: runImport as never,
    sendCopyShortcut: vi.fn(async () => true),
    showDesktopToast,
    waitForClipboardChange: vi.fn(async () => true),
    waitForReady
  })).resolves.toMatchObject({ import_id: 'import-1' });

  expect(waitForReady).toHaveBeenCalledTimes(1);
  expect(runImport).toHaveBeenCalledTimes(1);
  expect(showDesktopToast).toHaveBeenCalledTimes(1);
});

it('stays silent when changed clipboard content is not importable', async () => {
  const log = vi.fn();

  await expect(runGlobalClipToInbox({
    clipboardRef: createClipboardSnapshotSource('new selected text'),
    log,
    runImport: vi.fn(async () => null),
    sendCopyShortcut: vi.fn(async () => true),
    waitForClipboardChange: vi.fn(async () => true),
    waitForReady: vi.fn(async () => undefined)
  })).resolves.toBeNull();

  expect(log).toHaveBeenCalledWith('global_clip_import_empty');
});

it('logs import errors without notifying', async () => {
  const log = vi.fn();

  await expect(runGlobalClipToInbox({
    clipboardRef: createClipboardSnapshotSource('new selected text'),
    log,
    runImport: vi.fn(async () => {
      throw new Error('unsupported clipboard content');
    }),
    sendCopyShortcut: vi.fn(async () => true),
    waitForClipboardChange: vi.fn(async () => true),
    waitForReady: vi.fn(async () => undefined)
  })).resolves.toBeNull();

  expect(log).toHaveBeenCalledWith('global_clip_import_failed', { error: expect.any(Error) });
});
