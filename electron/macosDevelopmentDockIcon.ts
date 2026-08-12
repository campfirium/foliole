interface MacosDockApp {
  dock?: {
    hide(): void;
    setIcon(image: string): void;
  } | undefined;
  isPackaged?: boolean;
  setActivationPolicy?(policy: 'accessory' | 'prohibited' | 'regular'): void;
}

export function applyMacosDockPresentation(
  app: MacosDockApp,
  iconPath: string,
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env
) {
  if (platform !== 'darwin' || !app.dock) return false;
  if (env.FOLIOLE_ELECTRON_NATIVE_HIDDEN?.trim() === '1') {
    app.setActivationPolicy?.('accessory');
    app.dock.hide();
    return true;
  }
  if (app.isPackaged !== false) return false;
  app.dock.setIcon(iconPath);
  return true;
}
