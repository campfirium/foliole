import { BrowserWindow, app } from 'electron';

import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
import { isAppQuittingForBackgroundPresence } from '../backgroundPresence.js';
import { requestDevShellRestart } from '../devShellRestartRequest.js';
import { setMainWindowNativeControlsVisible } from '../mainWindowChrome.js';
import {
  allowWindowCloseWithoutReadingProgressFlush,
  flushWindowReadingProgress
} from '../readingProgressWindowFlush.js';

import { asBoolean } from './commandParsers.js';
import type { InvokeContext } from './commands.js';
import type { InvokeRequest } from './contracts.js';

export function resolveTargetWindow(context?: InvokeContext) {
  if (context?.sender) {
    const window = BrowserWindow.fromWebContents(context.sender);
    if (window) return window;
  }
  return BrowserWindow.getFocusedWindow();
}

async function prepareWindowForRestart(window: BrowserWindow | null) {
  if (!window) return;
  await flushWindowReadingProgress(window);
  allowWindowCloseWithoutReadingProgressFlush(window);
}

async function closeWindowToBackground(window: BrowserWindow | null) {
  if (!window || process.platform !== 'win32' || isAppQuittingForBackgroundPresence()) {
    return false;
  }
  await flushWindowReadingProgress(window);
  if (!window.isDestroyed()) window.hide();
  return true;
}

function handleImmediateWindowCommand(request: InvokeRequest, window: BrowserWindow | null) {
  if (request.command === NATIVE_COMMANDS.windowMinimize) {
    window?.minimize();
    return null;
  }
  if (request.command === NATIVE_COMMANDS.windowToggleDevTools) {
    if (!app.isPackaged) window?.webContents.toggleDevTools();
    return null;
  }
  if (request.command === NATIVE_COMMANDS.windowToggleMaximize) {
    if (window?.isMaximized()) window.unmaximize();
    else window?.maximize();
    return null;
  }
  if (request.command === NATIVE_COMMANDS.windowIsMaximized) {
    return Boolean(window?.isMaximized());
  }
  if (request.command === NATIVE_COMMANDS.windowSetNativeControlsVisible) {
    const args = (request.args ?? {}) as Record<string, unknown>;
    setMainWindowNativeControlsVisible(window, asBoolean(args.visible, 'visible'));
    return null;
  }
  return undefined;
}

async function handleWindowLifecycleCommand(request: InvokeRequest, window: BrowserWindow | null) {
  if (
    request.command === NATIVE_COMMANDS.windowRestartApp ||
    request.command === NATIVE_COMMANDS.windowRestartDevApp
  ) {
    await prepareWindowForRestart(window);
    if (
      request.command === NATIVE_COMMANDS.windowRestartDevApp &&
      requestDevShellRestart({ reason: 'in-app-dev-restart' })
    ) {
      app.exit(0);
      return null;
    }
    app.relaunch();
    app.exit(0);
    return null;
  }
  if (request.command === NATIVE_COMMANDS.windowClose) {
    if (!(await closeWindowToBackground(window))) window?.close();
    return null;
  }
  return undefined;
}

export async function handleWindowControlCommand(
  request: InvokeRequest,
  context?: InvokeContext
): Promise<unknown> {
  const window = resolveTargetWindow(context);
  const immediateResult = handleImmediateWindowCommand(request, window);
  if (immediateResult !== undefined) return immediateResult;
  return handleWindowLifecycleCommand(request, window);
}
