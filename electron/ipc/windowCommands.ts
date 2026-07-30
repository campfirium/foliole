import { app, shell } from 'electron';

import { normalizeOpenExternalUrl } from '../../lib/platform/externalUrl.js';
import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
import { resolveFolioleAppVersion } from '../appVersion.js';
import { copyDiagnosticReport } from '../diagnostics/diagnosticBundle.js';
import { runFolioleCliInstallAction } from '../folioleCliInstallation.js';
import { getGlobalClipShortcutStatus } from '../globalClipShortcut.js';
import { clearLinkPanelBrowsingData } from '../linkPanelBrowsingData.js';
import {
  isLoginItemSettingsSupported,
  loadLoginItemSettingsState,
  saveLoginItemSettingsState
} from '../loginItemSettings.js';
import { preflightMacosGlobalClipPermission } from '../macosGlobalClipCopy.js';
import { appendReadingPositionTraceRecord } from '../readingPositionTraceLog.js';

import { asString, asStringArray } from './commandParsers.js';
import type { InvokeContext } from './commands.js';
import type { InvokeRequest } from './contracts.js';
import { handleDisplayScaleCommand } from './displayScaleCommands.js';
import { listSystemFonts } from './fonts.js';
import { handleInitialLibrarySetupCommand } from './initialLibrarySetupCommands.js';
import { resolveAllowedLocalOpenPath } from './localOpenPathGuard.js';
import { syncAppMenuState } from './menu.js';
import { resolveAppPaths } from './paths.js';
import { handleSplitTopicPreferencesCommand } from './splitTopicPreferencesCommands.js';
import { handleWindowControlCommand, resolveTargetWindow } from './windowControlCommands.js';

function asShortcutAccelerators(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => {
      const raw = item as Record<string, unknown>;
      return {
        accelerator: typeof raw.accelerator === 'string' ? raw.accelerator : '',
        commandId: typeof raw.commandId === 'string' ? raw.commandId : ''
      };
    })
    .filter((item) => item.accelerator.trim() && item.commandId.trim());
}

export function getDesktopHostCapabilities(
  platform = process.platform,
  packaged = app.isPackaged,
  shortcutStatus = getGlobalClipShortcutStatus(platform),
  globalCapturePermission = platform === 'win32' ? 'notRequired' : 'unavailable'
) {
  return {
    globalCaptureShortcutLabel: shortcutStatus.globalCaptureShortcutLabel,
    globalCaptureShortcutRegistered: shortcutStatus.globalCaptureShortcutRegistered,
    globalCapturePermission,
    globalCaptureSupported: platform === 'win32' || platform === 'darwin',
    globalCaptureToastPositionSupported: platform === 'darwin',
    loginItemSupported: isLoginItemSettingsSupported(platform, packaged)
  };
}

async function loadDesktopHostCapabilities() {
  const permission = process.platform === 'darwin'
    ? await preflightMacosGlobalClipPermission()
    : process.platform === 'win32' ? 'notRequired' : 'unavailable';
  return getDesktopHostCapabilities(process.platform, app.isPackaged, getGlobalClipShortcutStatus(), permission);
}

function handleCliInstallCommand(request: InvokeRequest, context?: InvokeContext) {
  if (request.command !== NATIVE_COMMANDS.folioleCliInstall) return undefined;
  const args = (request.args ?? {}) as Record<string, unknown>;
  const action = asString(args.action, 'action');
  if (!['install', 'remove', 'repair', 'status'].includes(action)) throw new Error('invalid CLI install action');
  return runFolioleCliInstallAction(
    action as 'install' | 'remove' | 'repair' | 'status', resolveTargetWindow(context)
  );
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
    const url = normalizeOpenExternalUrl(asString(args.url, 'url'));
    if (!url) {
      return null;
    }
    return shell.openExternal(url).then(() => null);
  }
  if (request.command === NATIVE_COMMANDS.openLocalPath) {
    const targetPath = resolveAllowedLocalOpenPath(asString(args.path, 'path'), resolveAppPaths());
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
  if (request.command === NATIVE_COMMANDS.loadDesktopHostCapabilities) {
    return loadDesktopHostCapabilities();
  }
  if (request.command === NATIVE_COMMANDS.loadLoginItemSettings) {
    return loadLoginItemSettingsState();
  }
  if (request.command === NATIVE_COMMANDS.saveLoginItemSettings) {
    return saveLoginItemSettingsState(args.enabled === true);
  }
  if (request.command === NATIVE_COMMANDS.loadPerformanceMemorySnapshot) {
    return {
      main_process_rss_bytes: process.memoryUsage().rss
    };
  }
  if (request.command === NATIVE_COMMANDS.clearLinkPanelBrowsingData) {
    return clearLinkPanelBrowsingData();
  }
  if (request.command === NATIVE_COMMANDS.copyDiagnosticReport) {
    return copyDiagnosticReport({ app });
  }
  if (request.command === NATIVE_COMMANDS.syncAppMenuState) {
    syncAppMenuState(asStringArray(args.enabledCommandIds, 'enabledCommandIds'), asShortcutAccelerators(args.shortcutAccelerators));
    return null;
  }
  if (request.command === NATIVE_COMMANDS.appGetVersion) {
    return resolveFolioleAppVersion(app);
  }
  return undefined;
}

export async function handleWindowAndUtilityCommand(request: InvokeRequest, context?: InvokeContext): Promise<unknown> {
  const splitTopicPreferencesResult = handleSplitTopicPreferencesCommand(request);
  if (splitTopicPreferencesResult !== undefined) return splitTopicPreferencesResult;
  const displayScaleResult = handleDisplayScaleCommand(request, context);
  if (displayScaleResult !== undefined) return displayScaleResult;
  const setupResult = handleInitialLibrarySetupCommand(request, resolveTargetWindow(context));
  if (setupResult !== undefined) return setupResult;
  const cliInstallResult = handleCliInstallCommand(request, context);
  if (cliInstallResult !== undefined) return cliInstallResult;
  const utilityResult = handleUtilityCommand(request);
  if (utilityResult !== undefined) {
    return utilityResult;
  }
  return handleWindowControlCommand(request, context);
}
