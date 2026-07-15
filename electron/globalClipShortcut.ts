import { app, globalShortcut, type App, type GlobalShortcut } from 'electron';

import { appendMainProcessDiagnosticLog } from './diagnostics/mainProcessDiagnostics.js';

export interface GlobalClipShortcutConfig {
  accelerator: string;
  label: string;
}

interface InstallGlobalClipShortcutDeps {
  appRef?: Pick<App, 'on'>;
  captureToInbox: () => Promise<unknown>;
  globalShortcutRef?: Pick<GlobalShortcut, 'register' | 'unregister'>;
  log?: (event: string, payload?: Record<string, unknown>) => void;
  platform?: NodeJS.Platform;
}

let shortcutRegistered = false;

export function getGlobalClipShortcutConfig(
  platform: NodeJS.Platform = process.platform
): GlobalClipShortcutConfig | null {
  if (platform === 'win32') return { accelerator: 'Alt+Shift+C', label: 'Alt+Shift+C' };
  if (platform === 'darwin') return { accelerator: 'Command+Shift+C', label: 'Command+Shift+C' };
  return null;
}

export function getGlobalClipShortcutStatus(platform: NodeJS.Platform = process.platform) {
  const config = getGlobalClipShortcutConfig(platform);
  return {
    globalCaptureShortcutLabel: config?.label ?? null,
    globalCaptureShortcutRegistered: Boolean(config && shortcutRegistered)
  };
}

export function installGlobalClipShortcut(deps: InstallGlobalClipShortcutDeps) {
  const config = getGlobalClipShortcutConfig(deps.platform);
  shortcutRegistered = false;
  if (!config) return false;
  const appRef = deps.appRef ?? app;
  const globalShortcutRef = deps.globalShortcutRef ?? globalShortcut;
  const log = deps.log ?? appendMainProcessDiagnosticLog;
  try {
    shortcutRegistered = globalShortcutRef.register(config.accelerator, () => {
      void deps.captureToInbox().catch((error) => log('global_clip_to_inbox_failed', { error }));
    });
  } catch (error) {
    log('global_clip_shortcut_registration_failed', { error, shortcut: config.accelerator });
    return false;
  }
  if (!shortcutRegistered) {
    log('global_clip_shortcut_registration_failed', { shortcut: config.accelerator });
    return false;
  }
  appRef.on('will-quit', () => {
    globalShortcutRef.unregister(config.accelerator);
    shortcutRegistered = false;
  });
  log('global_clip_shortcut_registered', { shortcut: config.accelerator });
  return true;
}

export function resetGlobalClipShortcutForTests() {
  shortcutRegistered = false;
}
