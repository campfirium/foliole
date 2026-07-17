// @vitest-environment node

import { beforeEach, expect, it, vi } from 'vitest';

const { electronMocks } = vi.hoisted(() => ({
  electronMocks: {
    app: { on: vi.fn() },
    globalShortcut: { register: vi.fn(() => true), unregister: vi.fn() },
    powerMonitor: { on: vi.fn() }
  }
}));

vi.mock('electron', () => electronMocks);
vi.mock('./diagnostics/mainProcessDiagnostics.js', () => ({ appendMainProcessDiagnosticLog: vi.fn() }));

import {
  getGlobalClipShortcutConfig,
  getGlobalClipShortcutStatus,
  installGlobalClipShortcut,
  refreshGlobalClipShortcut,
  refreshGlobalClipShortcutFromSettings,
  resetGlobalClipShortcutForTests
} from './globalClipShortcut.js';

beforeEach(() => {
  vi.clearAllMocks();
  resetGlobalClipShortcutForTests();
});

it('provides one platform shortcut truth for Windows and macOS', () => {
  expect(getGlobalClipShortcutConfig('win32')).toEqual({ accelerator: 'Alt+Shift+C', label: 'Alt+Shift+C' });
  expect(getGlobalClipShortcutConfig('darwin')).toEqual({ accelerator: 'Alt+Shift+C', label: 'Alt+Shift+C' });
  expect(getGlobalClipShortcutConfig('linux')).toBeNull();
});

it.each(['win32', 'darwin'] as const)('registers and unregisters on %s', (platform) => {
  const appRef = { on: vi.fn() };
  const captureToInbox = vi.fn(async () => null);
  const globalShortcutRef = {
    register: vi.fn<(accelerator: string, callback: () => void) => boolean>(() => true),
    unregister: vi.fn<(accelerator: string) => void>()
  };

  expect(installGlobalClipShortcut({ appRef, captureToInbox, globalShortcutRef, platform })).toBe(true);
  const accelerator = 'Alt+Shift+C';
  expect(globalShortcutRef.register).toHaveBeenCalledWith(accelerator, expect.any(Function));
  expect(getGlobalClipShortcutStatus(platform).globalCaptureShortcutRegistered).toBe(true);

  const callback = globalShortcutRef.register.mock.calls[0]?.[1];
  callback?.();
  expect(captureToInbox).toHaveBeenCalledTimes(1);
  const willQuit = appRef.on.mock.calls.find(([event]) => event === 'will-quit')?.[1] as (() => void) | undefined;
  willQuit?.();
  expect(globalShortcutRef.unregister).toHaveBeenCalledWith(accelerator);
  expect(getGlobalClipShortcutStatus(platform).globalCaptureShortcutRegistered).toBe(false);
});

it('reports registration failure without a fallback shortcut', () => {
  const log = vi.fn();
  const globalShortcutRef = { register: vi.fn(() => false), unregister: vi.fn() };

  expect(installGlobalClipShortcut({
    captureToInbox: vi.fn(async () => null),
    globalShortcutRef,
    log,
    platform: 'darwin'
  })).toBe(false);

  expect(log).toHaveBeenCalledWith('global_clip_shortcut_registration_failed', { shortcut: 'Alt+Shift+C' });
  expect(getGlobalClipShortcutStatus('darwin')).toEqual({
    globalCaptureShortcutLabel: 'Alt+Shift+C',
    globalCaptureShortcutRegistered: false
  });
});

it('reports registration exceptions without a fallback shortcut', () => {
  const error = new Error('registration unavailable');
  const log = vi.fn();
  const globalShortcutRef = { register: vi.fn(() => { throw error; }), unregister: vi.fn() };

  expect(installGlobalClipShortcut({
    captureToInbox: vi.fn(async () => null),
    globalShortcutRef,
    log,
    platform: 'darwin'
  })).toBe(false);
  expect(log).toHaveBeenCalledWith('global_clip_shortcut_registration_failed', {
    error,
    shortcut: 'Alt+Shift+C'
  });
});

it('does not register on unsupported hosts', () => {
  const globalShortcutRef = { register: vi.fn(() => true), unregister: vi.fn() };
  expect(installGlobalClipShortcut({
    captureToInbox: vi.fn(async () => null),
    globalShortcutRef,
    platform: 'linux'
  })).toBe(false);
  expect(globalShortcutRef.register).not.toHaveBeenCalled();
});

it('replaces the active global shortcut when the saved command shortcut changes', () => {
  let accelerators = ['Command+Shift+C'];
  const globalShortcutRef = { register: vi.fn(() => true), unregister: vi.fn() };
  installGlobalClipShortcut({
    captureToInbox: vi.fn(async () => null),
    globalShortcutRef,
    platform: 'darwin',
    resolveAccelerators: () => accelerators
  });

  accelerators = ['Command+Shift+X'];
  expect(refreshGlobalClipShortcut()).toBe(true);

  expect(globalShortcutRef.unregister).toHaveBeenCalledWith('Command+Shift+C');
  expect(globalShortcutRef.register).toHaveBeenLastCalledWith('Command+Shift+X', expect.any(Function));
  expect(getGlobalClipShortcutStatus('darwin')).toEqual({
    globalCaptureShortcutLabel: 'Command+Shift+X',
    globalCaptureShortcutRegistered: true
  });
});

it('uses the platform default until persisted settings are safe to read', () => {
  const globalShortcutRef = { register: vi.fn(() => true), unregister: vi.fn() };
  installGlobalClipShortcut({
    captureToInbox: vi.fn(async () => null),
    globalShortcutRef,
    platform: 'darwin'
  });

  expect(globalShortcutRef.register).toHaveBeenLastCalledWith('Alt+Shift+C', expect.any(Function));
  expect(refreshGlobalClipShortcutFromSettings(() => ['Command+Shift+X'])).toBe(true);
  expect(globalShortcutRef.unregister).toHaveBeenCalledWith('Alt+Shift+C');
  expect(globalShortcutRef.register).toHaveBeenLastCalledWith('Command+Shift+X', expect.any(Function));
});

it.each(['activate', 'resume'] as const)('retries an unavailable shortcut on %s without polling', (eventName) => {
  let available = false;
  const appRef = { on: vi.fn() };
  const powerMonitorRef = { on: vi.fn() };
  const globalShortcutRef = { register: vi.fn(() => available), unregister: vi.fn() };
  installGlobalClipShortcut({
    appRef,
    captureToInbox: vi.fn(async () => null),
    globalShortcutRef,
    platform: 'darwin',
    powerMonitorRef
  });
  available = true;

  const eventSource = eventName === 'activate' ? appRef : powerMonitorRef;
  const retry = eventSource.on.mock.calls.find(([event]) => event === eventName)?.[1] as (() => void) | undefined;
  retry?.();

  expect(getGlobalClipShortcutStatus('darwin').globalCaptureShortcutRegistered).toBe(true);
  expect(globalShortcutRef.register).toHaveBeenCalledTimes(2);
  retry?.();
  expect(globalShortcutRef.register).toHaveBeenCalledTimes(2);
});
