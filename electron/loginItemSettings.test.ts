// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';

const appMock = vi.hoisted(() => ({
  getLoginItemSettings: vi.fn(),
  isPackaged: false,
  setLoginItemSettings: vi.fn()
}));

vi.mock('electron', () => ({
  app: appMock
}));

import {
  isLoginItemSettingsSupported,
  loadLoginItemSettingsState,
  mapMacosLoginItemSettingsStatus,
  mapWindowsLoginItemSettings,
  saveLoginItemSettingsState,
  wasOpenedAtLogin
} from './loginItemSettings.js';

beforeEach(() => {
  vi.clearAllMocks();
  appMock.getLoginItemSettings.mockReturnValue({ status: 'enabled' });
});

it('supports login items only in packaged Windows and macOS apps', () => {
  expect(isLoginItemSettingsSupported('darwin', true)).toBe(true);
  expect(isLoginItemSettingsSupported('win32', true)).toBe(true);
  expect(isLoginItemSettingsSupported('linux', true)).toBe(false);
  expect(isLoginItemSettingsSupported('darwin', false)).toBe(false);
});

it.each([
  ['not-registered', { effective: false, enabled: false, status: 'disabled', supported: true }],
  ['enabled', { effective: true, enabled: true, status: 'enabled', supported: true }],
  ['requires-approval', { effective: false, enabled: true, status: 'requires-approval', supported: true }],
  ['not-found', { effective: false, enabled: false, status: 'error', supported: true }]
])('maps the macOS %s status without collapsing user action or errors', (status, expected) => {
  expect(mapMacosLoginItemSettingsStatus(status)).toEqual(expected);
});

it('preserves the Windows selected and effective states', () => {
  expect(mapWindowsLoginItemSettings({ openAtLogin: false })).toEqual({
    effective: false, enabled: false, status: 'disabled', supported: true
  });
  expect(mapWindowsLoginItemSettings({ executableWillLaunchAtLogin: false, openAtLogin: true })).toEqual({
    effective: false, enabled: true, status: 'system-disabled', supported: true
  });
  expect(mapWindowsLoginItemSettings({ executableWillLaunchAtLogin: true, openAtLogin: true })).toEqual({
    effective: true, enabled: true, status: 'enabled', supported: true
  });
});

it('reads and writes the packaged macOS main app service without Windows-only options', () => {
  expect(loadLoginItemSettingsState('darwin', true)).toMatchObject({ status: 'enabled', supported: true });
  expect(appMock.getLoginItemSettings).toHaveBeenCalledWith({ type: 'mainAppService' });

  saveLoginItemSettingsState(false, 'darwin', true);

  expect(appMock.setLoginItemSettings).toHaveBeenCalledWith({ openAtLogin: false, type: 'mainAppService' });
});

it('keeps the existing Windows registration options', () => {
  appMock.getLoginItemSettings.mockReturnValue({ executableWillLaunchAtLogin: true, openAtLogin: true });

  saveLoginItemSettingsState(true, 'win32', true);

  expect(appMock.setLoginItemSettings).toHaveBeenCalledWith({ enabled: true, openAtLogin: true });
});

it('detects only packaged macOS launches that came from the login item', () => {
  appMock.getLoginItemSettings.mockReturnValue({ wasOpenedAtLogin: true });

  expect(wasOpenedAtLogin('darwin', true)).toBe(true);
  expect(wasOpenedAtLogin('darwin', false)).toBe(false);
  expect(wasOpenedAtLogin('win32', true)).toBe(false);
});
