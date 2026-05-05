import { BrowserWindow, app, shell, type WebContents } from 'electron';

import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
import {
  isTypedNativeRequest,
  type NativeInvokeRequest
} from '../../lib/platform/nativeContract.js';

import { bootReport } from './boot.js';
import { asString, asStringArray } from './commandParsers.js';
import type { InvokeRequest } from './contracts.js';
import { listSystemFonts } from './fonts.js';
import { runTextFileImport, selectImportTextFile } from './importTextFile.js';
import { syncAppMenuState } from './menu.js';
import { resolveAppPaths } from './paths.js';
import { reviewGrade, reviewPreview } from './review.js';
import { handleStorageCommand } from './storageCommands.js';

interface InvokeContext {
  sender?: WebContents;
}

function resolveTargetWindow(context?: InvokeContext) {
  if (context?.sender) {
    const window = BrowserWindow.fromWebContents(context.sender);
    if (window) {
      return window;
    }
  }
  return BrowserWindow.getFocusedWindow();
}

function isTypedRequest<T extends NativeInvokeRequest['command']>(
  request: InvokeRequest,
  command: T
): request is NativeInvokeRequest<T> {
  return isTypedNativeRequest(request, command);
}

async function handleWindowCommand(request: InvokeRequest, context?: InvokeContext): Promise<unknown> {
  const window = resolveTargetWindow(context);
  if (isTypedRequest(request, NATIVE_COMMANDS.windowMinimize)) {
    window?.minimize();
    return null;
  }
  if (isTypedRequest(request, NATIVE_COMMANDS.windowToggleDevTools)) {
    window?.webContents.toggleDevTools();
    return null;
  }
  if (isTypedRequest(request, NATIVE_COMMANDS.windowToggleMaximize)) {
    if (!window) {
      return null;
    }
    if (window.isMaximized()) {
      window.unmaximize();
    } else {
      window.maximize();
    }
    return null;
  }
  if (isTypedRequest(request, NATIVE_COMMANDS.windowClose)) {
    window?.close();
    return null;
  }
  if (isTypedRequest(request, NATIVE_COMMANDS.windowIsMaximized)) {
    return Boolean(window?.isMaximized());
  }
  return undefined;
}

export async function handleInvokeRequest(request: InvokeRequest, context?: InvokeContext): Promise<unknown> {
  const command = request.command;
  const args = (request.args ?? {}) as Record<string, unknown>;

  if (isTypedRequest(request, NATIVE_COMMANDS.openExternalUrl)) {
    const url = asString(request.args.url, 'url').trim();
    if (!url) {
      return null;
    }
    await shell.openExternal(url);
    return null;
  }
  if (isTypedRequest(request, NATIVE_COMMANDS.runTextFileImport)) {
    return runTextFileImport(resolveTargetWindow(context), request.args);
  }
  if (isTypedRequest(request, NATIVE_COMMANDS.selectImportTextFile)) {
    return selectImportTextFile(resolveTargetWindow(context), request.args);
  }

  if (isTypedRequest(request, NATIVE_COMMANDS.resolveAppPaths)) {
    return resolveAppPaths();
  }
  if (isTypedRequest(request, NATIVE_COMMANDS.listSystemFonts)) {
    return listSystemFonts();
  }
  if (isTypedRequest(request, NATIVE_COMMANDS.syncAppMenuState)) {
    syncAppMenuState(asStringArray(request.args.enabledCommandIds, 'enabledCommandIds'));
    return null;
  }

  const storageResult = await handleStorageCommand(command, args);
  if (storageResult !== undefined) {
    return storageResult;
  }

  const windowResult = await handleWindowCommand(request, context);
  if (windowResult !== undefined) {
    return windowResult;
  }
  if (isTypedRequest(request, NATIVE_COMMANDS.bootReport)) {
    await bootReport(asString(request.args.stage, 'stage'), request.args.payload ?? null);
    return null;
  }
  if (isTypedRequest(request, NATIVE_COMMANDS.reviewGrade)) {
    return reviewGrade(request.args);
  }
  if (isTypedRequest(request, NATIVE_COMMANDS.reviewPreview)) {
    return reviewPreview(request.args);
  }
  if (isTypedRequest(request, NATIVE_COMMANDS.appGetVersion)) {
    return app.getVersion();
  }
  throw new Error(`unsupported native command: ${command}`);
}
