import { BrowserWindow, app, shell, type WebContents } from 'electron';

import {
  isTypedNativeRequest,
  type NativeInvokeRequest
} from '../../lib/platform/nativeContract.js';

import { bootReport } from './boot.js';
import { asString, asStringArray } from './commandParsers.js';
import type { InvokeRequest } from './contracts.js';
import { listSystemFonts } from './fonts.js';
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
  if (isTypedRequest(request, 'window_minimize')) {
    window?.minimize();
    return null;
  }
  if (isTypedRequest(request, 'window_toggle_maximize')) {
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
  if (isTypedRequest(request, 'window_close')) {
    window?.close();
    return null;
  }
  if (isTypedRequest(request, 'window_is_maximized')) {
    return Boolean(window?.isMaximized());
  }
  return undefined;
}

export async function handleInvokeRequest(request: InvokeRequest, context?: InvokeContext): Promise<unknown> {
  const command = request.command;
  const args = (request.args ?? {}) as Record<string, unknown>;

  if (isTypedRequest(request, 'open_external_url')) {
    const url = asString(request.args.url, 'url').trim();
    if (!url) {
      return null;
    }
    await shell.openExternal(url);
    return null;
  }

  if (isTypedRequest(request, 'resolve_app_paths')) {
    return resolveAppPaths();
  }
  if (isTypedRequest(request, 'list_system_fonts')) {
    return listSystemFonts();
  }
  if (isTypedRequest(request, 'sync_app_menu_state')) {
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
  if (isTypedRequest(request, 'boot_report')) {
    await bootReport(asString(request.args.stage, 'stage'), request.args.payload ?? null);
    return null;
  }
  if (isTypedRequest(request, 'review_grade')) {
    return reviewGrade(request.args);
  }
  if (isTypedRequest(request, 'review_preview')) {
    return reviewPreview(request.args);
  }
  if (isTypedRequest(request, 'app_get_version')) {
    return app.getVersion();
  }
  throw new Error(`unsupported native command: ${command}`);
}
