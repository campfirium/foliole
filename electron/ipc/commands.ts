import { BrowserWindow, app, dialog, shell, type WebContents } from 'electron';

import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
import {
  isTypedNativeRequest,
  type NativeInvokeRequest
} from '../../lib/platform/nativeContract.js';
import { previewKeepImportRule } from '../import/keepImportService.js';

import { bootReport } from './boot.js';
import { asString, asStringArray } from './commandParsers.js';
import type { InvokeRequest } from './contracts.js';
import { listSystemFonts } from './fonts.js';
import { runDirectoryImport } from './importDirectory.js';
import { runTextFileImport, selectImportTextFile } from './importTextFile.js';
import { syncAppMenuState } from './menu.js';
import { resolveAppPaths } from './paths.js';
import { inspectReadwiseReaderSetup } from './readwiseReaderSetup.js';
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
  if (isTypedRequest(request, NATIVE_COMMANDS.windowRestartApp)) {
    app.relaunch();
    app.exit(0);
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

async function selectImportDirectory(context?: InvokeContext) {
  const window = resolveTargetWindow(context);
  const selection = window
    ? await dialog.showOpenDialog(window, { properties: ['openDirectory'] })
    : await dialog.showOpenDialog({ properties: ['openDirectory'] });
  if (selection.canceled || selection.filePaths.length === 0) {
    return null;
  }
  return selection.filePaths[0] ?? null;
}

async function handleImportCommand(request: InvokeRequest, context?: InvokeContext) {
  if (isTypedRequest(request, NATIVE_COMMANDS.openExternalUrl)) {
    const url = asString(request.args.url, 'url').trim();
    if (!url) {
      return null;
    }
    await shell.openExternal(url);
    return null;
  }
  if (isTypedRequest(request, NATIVE_COMMANDS.inspectReadwiseReaderSetup)) {
    return inspectReadwiseReaderSetup(request.args);
  }
  if (isTypedRequest(request, NATIVE_COMMANDS.runTextFileImport)) {
    return runTextFileImport(resolveTargetWindow(context), request.args);
  }
  if (isTypedRequest(request, NATIVE_COMMANDS.runDirectoryImport)) {
    return runDirectoryImport(resolveTargetWindow(context), request.args);
  }
  if (isTypedRequest(request, NATIVE_COMMANDS.previewKeepImportRule)) {
    return previewKeepImportRule({
      directoryPath: asString(request.args.directory_path, 'directory_path'),
      highlightPolicy: 'reference_only',
      ruleId: asString(request.args.rule_id, 'rule_id')
    });
  }
  if (isTypedRequest(request, NATIVE_COMMANDS.selectImportTextFile)) {
    return selectImportTextFile(resolveTargetWindow(context), request.args);
  }
  if (isTypedRequest(request, NATIVE_COMMANDS.selectImportDirectory)) {
    return selectImportDirectory(context);
  }
  return undefined;
}

function handleUtilityCommand(request: InvokeRequest) {
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
  return undefined;
}

async function handleReviewAndBootCommand(request: InvokeRequest) {
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
  return undefined;
}

export async function handleInvokeRequest(request: InvokeRequest, context?: InvokeContext): Promise<unknown> {
  const command = request.command;
  const args = (request.args ?? {}) as Record<string, unknown>;

  const importResult = await handleImportCommand(request, context);
  if (importResult !== undefined) {
    return importResult;
  }
  const utilityResult = handleUtilityCommand(request);
  if (utilityResult !== undefined) {
    return utilityResult;
  }
  const storageResult = await handleStorageCommand(command, args);
  if (storageResult !== undefined) {
    return storageResult;
  }

  const windowResult = await handleWindowCommand(request, context);
  if (windowResult !== undefined) {
    return windowResult;
  }
  const trailingResult = await handleReviewAndBootCommand(request);
  if (trailingResult !== undefined) {
    return trailingResult;
  }
  throw new Error(`unsupported native command: ${command}`);
}
