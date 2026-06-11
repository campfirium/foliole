import { app } from 'electron';

export interface LoginItemSettingsState {
  enabled: boolean;
  effective: boolean;
  supported: boolean;
}

export function loadLoginItemSettingsState(): LoginItemSettingsState {
  if (!app.isPackaged || process.platform !== 'win32') {
    return { enabled: false, effective: false, supported: false };
  }
  const settings = app.getLoginItemSettings();
  return {
    enabled: settings.openAtLogin === true,
    effective: settings.executableWillLaunchAtLogin !== false && settings.openAtLogin === true,
    supported: true
  };
}

export function saveLoginItemSettingsState(enabled: boolean): LoginItemSettingsState {
  if (!app.isPackaged || process.platform !== 'win32') {
    return loadLoginItemSettingsState();
  }
  app.setLoginItemSettings({
    enabled: true,
    openAtLogin: enabled
  });
  return loadLoginItemSettingsState();
}
