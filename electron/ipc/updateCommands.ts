import { BrowserWindow } from 'electron';

import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
import { getMainWindow } from '../mainWindowRegistry.js';
import { desktopUpdateService } from '../update/desktopUpdateRuntime.js';

import type { InvokeContext } from './commands.js';
import type { InvokeRequest } from './contracts.js';

function resolveAuthorizedSender(context?: InvokeContext) {
  const sender = context?.sender;
  const mainWindow = getMainWindow();
  if (!sender || !mainWindow || mainWindow.isDestroyed() || mainWindow.webContents !== sender) {
    throw new Error('desktop update command rejected for non-main-window sender');
  }
  if (BrowserWindow.fromWebContents(sender) !== mainWindow) {
    throw new Error('desktop update command sender is not attached to the main window');
  }
  return sender;
}

export function handleDesktopUpdateCommand(request: InvokeRequest, context?: InvokeContext) {
  const sender = resolveAuthorizedSender(context);
  if (request.command === NATIVE_COMMANDS.desktopUpdateCheck) {
    const targetVersion = typeof request.args?.targetVersion === 'string' ? request.args.targetVersion : '';
    return desktopUpdateService.check(targetVersion, sender);
  }
  if (request.command === NATIVE_COMMANDS.desktopUpdateDownload) {
    return desktopUpdateService.download();
  }
  if (request.command === NATIVE_COMMANDS.desktopUpdateInstall) {
    return desktopUpdateService.install();
  }
  return undefined;
}
