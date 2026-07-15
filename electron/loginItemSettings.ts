import { app } from 'electron';

export type LoginItemSettingsStatus =
  | 'disabled'
  | 'enabled'
  | 'error'
  | 'requires-approval'
  | 'system-disabled'
  | 'unsupported';

export interface LoginItemSettingsState {
  enabled: boolean;
  effective: boolean;
  status: LoginItemSettingsStatus;
  supported: boolean;
}

const UNSUPPORTED_STATE: LoginItemSettingsState = {
  enabled: false,
  effective: false,
  status: 'unsupported',
  supported: false
};

export function isLoginItemSettingsSupported(platform: NodeJS.Platform, packaged: boolean) {
  return packaged && (platform === 'darwin' || platform === 'win32');
}

export function mapMacosLoginItemSettingsStatus(status: string): LoginItemSettingsState {
  if (status === 'enabled') return { enabled: true, effective: true, status: 'enabled', supported: true };
  if (status === 'requires-approval') {
    return { enabled: true, effective: false, status: 'requires-approval', supported: true };
  }
  if (status === 'not-registered') return { enabled: false, effective: false, status: 'disabled', supported: true };
  return { enabled: false, effective: false, status: 'error', supported: true };
}

export function mapWindowsLoginItemSettings(settings: {
  executableWillLaunchAtLogin?: boolean;
  openAtLogin?: boolean;
}): LoginItemSettingsState {
  if (settings.openAtLogin !== true) return { enabled: false, effective: false, status: 'disabled', supported: true };
  const effective = settings.executableWillLaunchAtLogin !== false;
  return { enabled: true, effective, status: effective ? 'enabled' : 'system-disabled', supported: true };
}

export function loadLoginItemSettingsState(
  platform: NodeJS.Platform = process.platform,
  packaged = app.isPackaged
): LoginItemSettingsState {
  if (!isLoginItemSettingsSupported(platform, packaged)) return UNSUPPORTED_STATE;
  if (platform === 'darwin') {
    return mapMacosLoginItemSettingsStatus(app.getLoginItemSettings({ type: 'mainAppService' }).status);
  }
  return mapWindowsLoginItemSettings(app.getLoginItemSettings());
}

export function saveLoginItemSettingsState(
  enabled: boolean,
  platform: NodeJS.Platform = process.platform,
  packaged = app.isPackaged
): LoginItemSettingsState {
  if (!isLoginItemSettingsSupported(platform, packaged)) return loadLoginItemSettingsState(platform, packaged);
  if (platform === 'darwin') {
    app.setLoginItemSettings({ openAtLogin: enabled, type: 'mainAppService' });
  } else {
    app.setLoginItemSettings({ enabled: true, openAtLogin: enabled });
  }
  return loadLoginItemSettingsState(platform, packaged);
}

export function wasOpenedAtLogin(
  platform: NodeJS.Platform = process.platform,
  packaged = app.isPackaged
) {
  return platform === 'darwin'
    && packaged
    && app.getLoginItemSettings({ type: 'mainAppService' }).wasOpenedAtLogin === true;
}
