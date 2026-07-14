interface MacosDockApp {
  dock?: {
    setIcon(image: string): void;
  } | undefined;
  isPackaged?: boolean;
}

export function applyMacosDevelopmentDockIcon(
  app: MacosDockApp,
  iconPath: string,
  platform: NodeJS.Platform = process.platform
) {
  if (platform !== 'darwin' || app.isPackaged !== false || !app.dock) return false;
  app.dock.setIcon(iconPath);
  return true;
}
