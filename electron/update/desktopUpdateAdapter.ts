import type { NativeDesktopUpdateState } from '../../lib/platform/nativeUpdateContract.js';

export interface DesktopUpdaterAdapter {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  allowDowngrade: boolean;
  checkForUpdates: () => Promise<{ isUpdateAvailable: boolean; updateInfo: { version: string } } | null>;
  downloadUpdate: () => Promise<string[]>;
  on: (event: string, listener: (payload?: unknown) => void) => unknown;
  quitAndInstall: (isSilent?: boolean, isForceRunAfter?: boolean) => void;
}

interface ElectronUpdaterCommonJsNamespace {
  default?: { autoUpdater?: DesktopUpdaterAdapter };
}

export function resolveElectronUpdater(module: unknown) {
  const updater = (module as ElectronUpdaterCommonJsNamespace).default?.autoUpdater;
  if (!updater) throw new Error('electron-updater CommonJS default export is unavailable');
  return updater;
}

function safeNumber(value: unknown, minimum = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(minimum, value) : undefined;
}

export function configureDesktopUpdater(
  updater: DesktopUpdaterAdapter,
  getVersion: () => string | undefined,
  publish: (state: NativeDesktopUpdateState) => void
) {
  updater.autoDownload = false;
  updater.autoInstallOnAppQuit = false;
  updater.allowDowngrade = false;
  updater.on('download-progress', (payload) => {
    const progress = payload as Record<string, unknown> | undefined;
    publish({
      percent: Math.min(100, safeNumber(progress?.percent) ?? 0),
      phase: 'downloading',
      totalBytes: safeNumber(progress?.total),
      transferredBytes: safeNumber(progress?.transferred),
      version: getVersion()
    });
  });
}
