// @vitest-environment node

import { beforeEach, expect, it, vi } from 'vitest';

const { electronMocks } = vi.hoisted(() => ({
  electronMocks: {
    app: { on: vi.fn() },
    clipboard: {},
    globalShortcut: {
      register: vi.fn(() => true),
      unregister: vi.fn()
    },
    BrowserWindow: Object.assign(vi.fn(function BrowserWindow() {
      return {};
    }), { getAllWindows: vi.fn(() => []) }),
    nativeTheme: { shouldUseDarkColors: false },
    screen: {
      getPrimaryDisplay: vi.fn(() => ({
        workArea: { height: 900, width: 1400, x: 0, y: 0 }
      }))
    }
  }
}));

vi.mock('electron', () => electronMocks);
vi.mock('./diagnostics/mainProcessDiagnostics.js', () => ({ appendMainProcessDiagnosticLog: vi.fn() }));
vi.mock('./database/databaseReadiness.js', () => ({ waitForDatabaseReady: vi.fn(async () => undefined) }));
vi.mock('./ipc/importClipboard.js', () => ({ runClipboardImport: vi.fn(async () => null) }));

import { installGlobalClipToInboxShortcut, prepareGlobalClipToInboxWindows } from './globalClipToInbox.js';

beforeEach(() => {
  vi.clearAllMocks();
  electronMocks.globalShortcut.register.mockReturnValue(true);
});

it('registers and unregisters the Windows global clip shortcut', () => {
  const appRef = { on: vi.fn() };
  const prepareCapturePanel = vi.fn();
  const prepareDesktopToast = vi.fn();
  const globalShortcutRef = {
    register: vi.fn(() => true),
    unregister: vi.fn()
  };

  expect(installGlobalClipToInboxShortcut({
    appRef,
    globalShortcutRef,
    prepareCapturePanel,
    prepareDesktopToast,
    platform: 'win32'
  })).toBe(true);

  expect(globalShortcutRef.register).toHaveBeenCalledWith('Alt+Shift+C', expect.any(Function));
  expect(prepareCapturePanel).not.toHaveBeenCalled();
  expect(prepareDesktopToast).not.toHaveBeenCalled();
  expect(prepareGlobalClipToInboxWindows({ prepareCapturePanel, prepareDesktopToast, platform: 'win32' })).toBe(true);
  expect(prepareCapturePanel).toHaveBeenCalledTimes(1);
  expect(prepareDesktopToast).toHaveBeenCalledTimes(1);
  const willQuit = appRef.on.mock.calls.find(([event]) => event === 'will-quit')?.[1] as (() => void) | undefined;
  expect(willQuit).toBeTypeOf('function');
  willQuit?.();
  expect(globalShortcutRef.unregister).toHaveBeenCalledWith('Alt+Shift+C');
});

it('does not register outside Windows', () => {
  const globalShortcutRef = {
    register: vi.fn(() => true),
    unregister: vi.fn()
  };

  expect(installGlobalClipToInboxShortcut({
    globalShortcutRef,
    prepareCapturePanel: vi.fn(),
    platform: 'linux'
  })).toBe(false);

  expect(globalShortcutRef.register).not.toHaveBeenCalled();
  expect(prepareGlobalClipToInboxWindows({ prepareCapturePanel: vi.fn(), platform: 'linux' })).toBe(false);
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
    prepareCapturePanel: vi.fn(),
    platform: 'win32'
  })).toBe(false);

  expect(log).toHaveBeenCalledWith('global_clip_shortcut_registration_failed', { shortcut: 'Alt+Shift+C' });
});
