import { BrowserWindow, app, shell, type WebContents } from 'electron';

import { bootReport } from './boot.js';
import { asString, asStringArray } from './commandParsers.js';
import type { InvokeRequest } from './contracts.js';
import { listSystemFonts } from './fonts.js';
import { syncAppMenuState } from './menu.js';
import { resolveAppPaths } from './paths.js';
import { reviewGrade, reviewPreview, type ReviewGradeRequest, type ReviewPreviewRequest } from './review.js';
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

async function handleWindowCommand(command: string, context?: InvokeContext): Promise<unknown> {
  const window = resolveTargetWindow(context);
  if (command === 'window_minimize') {
    window?.minimize();
    return null;
  }
  if (command === 'window_toggle_maximize') {
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
  if (command === 'window_close') {
    window?.close();
    return null;
  }
  if (command === 'window_is_maximized') {
    return Boolean(window?.isMaximized());
  }
  return undefined;
}

export async function handleInvokeRequest(request: InvokeRequest, context?: InvokeContext): Promise<unknown> {
  const command = request.command;
  const args = request.args ?? {};

  if (command === 'open_external_url') {
    const url = asString(args.url, 'url').trim();
    if (!url) {
      return null;
    }
    await shell.openExternal(url);
    return null;
  }

  if (command === 'resolve_app_paths') {
    return resolveAppPaths();
  }
  if (command === 'list_system_fonts') {
    return listSystemFonts();
  }
  if (command === 'sync_app_menu_state') {
    syncAppMenuState(asStringArray(args.enabledCommandIds, 'enabledCommandIds'));
    return null;
  }

  const storageResult = await handleStorageCommand(command, args);
  if (storageResult !== undefined) {
    return storageResult;
  }

  const windowResult = await handleWindowCommand(command, context);
  if (windowResult !== undefined) {
    return windowResult;
  }
  if (command === 'boot_report') {
    await bootReport(asString(args.stage, 'stage'), args.payload ?? null);
    return null;
  }
  if (command === 'review_grade') {
    return reviewGrade(args as unknown as ReviewGradeRequest);
  }
  if (command === 'review_preview') {
    return reviewPreview(args as unknown as ReviewPreviewRequest);
  }
  if (command === 'app_get_version') {
    return app.getVersion();
  }
  throw new Error(`unsupported native command: ${command}`);
}
