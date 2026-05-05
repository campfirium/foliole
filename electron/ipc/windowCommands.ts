import { BrowserWindow, app, shell } from 'electron';

import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
import { appendReadingPositionTraceRecord } from '../readingPositionTraceLog.js';
import { allowWindowCloseWithoutReadingProgressFlush, flushWindowReadingProgress } from '../readingProgressWindowFlush.js';

import { asString, asStringArray } from './commandParsers.js';
import type { InvokeContext } from './commands.js';
import type { InvokeRequest } from './contracts.js';
import { listSystemFonts } from './fonts.js';
import { syncAppMenuState } from './menu.js';
import { resolveAppPaths } from './paths.js';

function resolveTargetWindow(context?: InvokeContext) {
  if (context?.sender) {
    const window = BrowserWindow.fromWebContents(context.sender);
    if (window) {
      return window;
    }
  }
  return BrowserWindow.getFocusedWindow();
}

async function handleWindowCommand(request: InvokeRequest, context?: InvokeContext): Promise<unknown> {
  const window = resolveTargetWindow(context);
  if (request.command === NATIVE_COMMANDS.windowMinimize) {
    window?.minimize();
    return null;
  }
  if (request.command === NATIVE_COMMANDS.windowRestartApp) {
    if (window) {
      await flushWindowReadingProgress(window);
      allowWindowCloseWithoutReadingProgressFlush(window);
    }
    app.relaunch();
    app.exit(0);
    return null;
  }
  if (request.command === NATIVE_COMMANDS.windowToggleDevTools) {
    window?.webContents.toggleDevTools();
    return null;
  }
  if (request.command === NATIVE_COMMANDS.windowToggleMaximize) {
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
  if (request.command === NATIVE_COMMANDS.windowClose) {
    window?.close();
    return null;
  }
  if (request.command === NATIVE_COMMANDS.windowIsMaximized) {
    return Boolean(window?.isMaximized());
  }
  return undefined;
}

function handleUtilityCommand(request: InvokeRequest) {
  const args = (request.args ?? {}) as Record<string, unknown>;

  if (request.command === NATIVE_COMMANDS.appendReadingPositionTraceLog) {
    return appendReadingPositionTraceRecord({
      event: asString(args.event, 'event'),
      payload: args.payload,
      timestamp: Number(args.timestamp ?? Date.now())
    });
  }
  if (request.command === NATIVE_COMMANDS.openExternalUrl) {
    const url = asString(args.url, 'url').trim();
    if (!url) {
      return null;
    }
    return shell.openExternal(url).then(() => null);
  }
  if (request.command === NATIVE_COMMANDS.openLocalPath) {
    const targetPath = asString(args.path, 'path').trim();
    if (!targetPath) {
      return null;
    }
    return shell.openPath(targetPath).then(() => null);
  }
  if (request.command === NATIVE_COMMANDS.resolveAppPaths) {
    return resolveAppPaths();
  }
  if (request.command === NATIVE_COMMANDS.listSystemFonts) {
    return listSystemFonts();
  }
  if (request.command === NATIVE_COMMANDS.loadPerformanceMemorySnapshot) {
    return {
      main_process_rss_bytes: process.memoryUsage().rss
    };
  }
  if (request.command === NATIVE_COMMANDS.syncAppMenuState) {
    syncAppMenuState(asStringArray(args.enabledCommandIds, 'enabledCommandIds'));
    return null;
  }
  if (request.command === NATIVE_COMMANDS.appGetVersion) {
    return app.getVersion();
  }
  return undefined;
}

export async function handleWindowAndUtilityCommand(request: InvokeRequest, context?: InvokeContext): Promise<unknown> {
  const utilityResult = handleUtilityCommand(request);
  if (utilityResult !== undefined) {
    return utilityResult;
  }
  return handleWindowCommand(request, context);
}
