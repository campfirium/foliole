import { app, globalShortcut, type App, type GlobalShortcut } from 'electron';

import { getDefaultGlobalCaptureAccelerator } from '../lib/platform/globalCaptureShortcut.js';

import { appendMainProcessDiagnosticLog } from './diagnostics/mainProcessDiagnostics.js';
import { getGlobalClipShortcutAccelerators } from './globalClipSettings.js';

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
  resolveAccelerators?: () => string[];
}

type InstalledGlobalClipShortcutDeps = Required<Pick<InstallGlobalClipShortcutDeps, 'captureToInbox'>> & {
  appRef: Pick<App, 'on'>;
  globalShortcutRef: Pick<GlobalShortcut, 'register' | 'unregister'>;
  log: NonNullable<InstallGlobalClipShortcutDeps['log']>;
  platform: NodeJS.Platform;
  resolveAccelerators: () => string[];
};

let activeAccelerators: string[] = [];
let configuredAccelerators: string[] = [];
let installedDeps: InstalledGlobalClipShortcutDeps | null = null;
let willQuitBound = false;

export function getGlobalClipShortcutConfig(
  platform: NodeJS.Platform = process.platform
): GlobalClipShortcutConfig | null {
  const accelerator = getDefaultGlobalCaptureAccelerator(platform);
  return accelerator ? { accelerator, label: accelerator } : null;
}

export function getGlobalClipShortcutStatus(platform: NodeJS.Platform = process.platform) {
  const config = getGlobalClipShortcutConfig(platform);
  return {
    globalCaptureShortcutLabel: configuredAccelerators[0] ?? config?.label ?? null,
    globalCaptureShortcutRegistered: activeAccelerators.length > 0
  };
}

function unregisterActiveShortcuts(deps: InstalledGlobalClipShortcutDeps) {
  for (const accelerator of activeAccelerators) deps.globalShortcutRef.unregister(accelerator);
  activeAccelerators = [];
}

function registerShortcut(deps: InstalledGlobalClipShortcutDeps, accelerator: string) {
  try {
    const registered = deps.globalShortcutRef.register(accelerator, () => {
      void deps.captureToInbox().catch((error) => deps.log('global_clip_to_inbox_failed', { error }));
    });
    if (registered) return true;
    deps.log('global_clip_shortcut_registration_failed', { shortcut: accelerator });
  } catch (error) {
    deps.log('global_clip_shortcut_registration_failed', { error, shortcut: accelerator });
  }
  return false;
}

export function refreshGlobalClipShortcut() {
  if (!installedDeps) return false;
  unregisterActiveShortcuts(installedDeps);
  configuredAccelerators = Array.from(new Set(installedDeps.resolveAccelerators().filter(Boolean)));
  for (const accelerator of configuredAccelerators) {
    if (registerShortcut(installedDeps, accelerator)) activeAccelerators.push(accelerator);
  }
  if (activeAccelerators.length) {
    installedDeps.log('global_clip_shortcut_registered', { shortcuts: activeAccelerators });
  }
  return configuredAccelerators.length > 0 && activeAccelerators.length === configuredAccelerators.length;
}

export function refreshGlobalClipShortcutFromSettings(
  resolveAccelerators: () => string[] = () => getGlobalClipShortcutAccelerators(process.platform)
) {
  if (!installedDeps) return false;
  installedDeps.resolveAccelerators = resolveAccelerators;
  return refreshGlobalClipShortcut();
}

export function installGlobalClipShortcut(deps: InstallGlobalClipShortcutDeps) {
  const platform = deps.platform ?? process.platform;
  const defaultConfig = getGlobalClipShortcutConfig(platform);
  installedDeps = {
    appRef: deps.appRef ?? app,
    captureToInbox: deps.captureToInbox,
    globalShortcutRef: deps.globalShortcutRef ?? globalShortcut,
    log: deps.log ?? appendMainProcessDiagnosticLog,
    platform,
    resolveAccelerators: deps.resolveAccelerators ?? (() => defaultConfig ? [defaultConfig.accelerator] : [])
  };
  if (!willQuitBound) {
    willQuitBound = true;
    installedDeps.appRef.on('will-quit', () => {
      if (installedDeps) unregisterActiveShortcuts(installedDeps);
    });
  }
  return refreshGlobalClipShortcut();
}

export function resetGlobalClipShortcutForTests() {
  activeAccelerators = [];
  configuredAccelerators = [];
  installedDeps = null;
  willQuitBound = false;
}
