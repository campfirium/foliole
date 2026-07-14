import fs from 'node:fs';
import path from 'node:path';

import { prepareWindowsForDevRestart, type RestartIntentWindow } from './devRestartRelaunch.js';

const SHELL_REQUEST_KIND = 'foliole-dev-shell-restart';

interface ExitApp {
  exit(code?: number): void;
}


interface RequestWatcher {
  close(): void;
  on?(event: 'error', handler: (error: Error) => void): void;
}

interface InstallOptions {
  app: ExitApp;
  env?: NodeJS.ProcessEnv;
  getWindows: () => RestartIntentWindow[];
  logger?: Pick<Console, 'error' | 'info'>;
  platform?: NodeJS.Platform;
  prepareExit?: () => Promise<void>;
  readRequest?: (filePath: string) => unknown;
  watch?: (path: string, listener: (_event: string, fileName: string | Buffer | null) => void) => RequestWatcher;
}

export function installMacosDailyDebugExitHandler(options: InstallOptions) {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const requestFile = env.FOLIOLE_DEV_SHELL_RESTART_REQUEST_FILE?.trim();
  if (platform !== 'darwin' || env.FOLIOLE_MACOS_DAILY_DEBUG !== '1' || !requestFile) return null;
  const logger = options.logger ?? console;
  const prepareExit = options.prepareExit ?? (() => prepareWindowsForDevRestart(options.getWindows()));
  const readRequest = options.readRequest ?? ((filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8')));
  let exitStarted = false;
  const watcher = (options.watch ?? fs.watch)(path.dirname(requestFile), (_event, fileName) => {
    if (fileName !== null && String(fileName) !== path.basename(requestFile)) return;
    try {
      const request = readRequest(requestFile) as { kind?: string } | null;
      if (request?.kind === SHELL_REQUEST_KIND) requestExit();
    } catch {
      return;
    }
  });
  watcher.on?.('error', (error) => logger.error('[electron-main] macOS daily debug request watch failed', error));
  logger.info('[electron-main] macOS daily debug exit control ready');
  return { close: () => watcher.close() };

  function requestExit() {
    if (exitStarted) return;
    exitStarted = true;
    void prepareExit()
      .catch((error) => logger.error('[electron-main] macOS daily debug exit preparation failed', error))
      .finally(() => options.app.exit(0));
  }
}
