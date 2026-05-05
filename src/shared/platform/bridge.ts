import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';
import type { NativeInvoke } from '../../../lib/platform/nativeContract';

import { getElectronAPI } from './electronApi';
import { isDesktopRuntime } from './runtime';

const EXTERNAL_URL_WINDOW_FEATURES = 'noopener,noreferrer';

export type RuntimeInvoke = NativeInvoke;
export type NativeMenuUnlisten = (() => void) | null;
export type WindowResizeUnlisten = (() => void) | null;

export interface RuntimeAppPaths {
  appDataDir: string;
  appConfigDir: string;
  appCacheDir: string;
  appLogDir: string;
}

export interface RuntimeSystemFontCatalog {
  fonts: string[];
  monospaceFonts: string[];
}

interface ResolveAppPathsResult {
  app_data_dir?: unknown;
  app_config_dir?: unknown;
  app_cache_dir?: unknown;
  app_log_dir?: unknown;
}

interface ListSystemFontsResult {
  fonts?: unknown;
  monospace_fonts?: unknown;
}

export function getRuntimeInvoke(): RuntimeInvoke | null {
  if (!isDesktopRuntime()) {
    return null;
  }
  return getElectronAPI()?.invoke ?? null;
}

function getElectronBridge() {
  if (!isDesktopRuntime()) {
    return null;
  }
  return getElectronAPI();
}

function resolveExternalUrl(target: string) {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    return new URL(target, window.location.href).toString();
  } catch {
    return null;
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function toRuntimeAppPaths(value: unknown): RuntimeAppPaths | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const payload = value as ResolveAppPathsResult;
  if (
    !isNonEmptyString(payload.app_data_dir) ||
    !isNonEmptyString(payload.app_config_dir) ||
    !isNonEmptyString(payload.app_cache_dir) ||
    !isNonEmptyString(payload.app_log_dir)
  ) {
    return null;
  }
  return {
    appDataDir: payload.app_data_dir,
    appConfigDir: payload.app_config_dir,
    appCacheDir: payload.app_cache_dir,
    appLogDir: payload.app_log_dir
  };
}

function toRuntimeSystemFontCatalog(value: unknown): RuntimeSystemFontCatalog | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const payload = value as ListSystemFontsResult;
  const fonts = Array.isArray(payload.fonts) ? payload.fonts.filter((item): item is string => typeof item === 'string') : [];
  const monospaceFonts = Array.isArray(payload.monospace_fonts)
    ? payload.monospace_fonts.filter((item): item is string => typeof item === 'string')
    : [];
  return { fonts, monospaceFonts };
}

export async function openExternalUrl(target: string) {
  const trimmedTarget = target.trim();
  if (!trimmedTarget) {
    return;
  }

  const resolvedUrl = resolveExternalUrl(trimmedTarget);
  if (!resolvedUrl) {
    return;
  }

  const runtimeInvoke = getRuntimeInvoke();
  if (runtimeInvoke) {
    try {
      await runtimeInvoke(NATIVE_COMMANDS.openExternalUrl, { url: resolvedUrl });
      return;
    } catch {
      // Fall back to browser behavior if native opener is unavailable.
    }
  }

  window.open(resolvedUrl, '_blank', EXTERNAL_URL_WINDOW_FEATURES);
}

export async function resolveRuntimeAppPaths(): Promise<RuntimeAppPaths | null> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return null;
  }
  try {
    return toRuntimeAppPaths(await runtimeInvoke(NATIVE_COMMANDS.resolveAppPaths));
  } catch {
    return null;
  }
}

export async function listRuntimeSystemFonts(): Promise<RuntimeSystemFontCatalog | null> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return null;
  }
  try {
    return toRuntimeSystemFontCatalog(await runtimeInvoke(NATIVE_COMMANDS.listSystemFonts));
  } catch {
    return null;
  }
}

export async function onNativeMenuCommand(handler: (commandId: string) => void): Promise<NativeMenuUnlisten> {
  const bridge = getElectronBridge();
  if (!bridge) {
    return null;
  }
  return bridge.onNativeMenuCommand((commandId) => {
    if (!commandId.trim() || commandId === '__menu_focus_sync__') {
      return;
    }
    handler(commandId);
  });
}

export async function syncNativeMenuState(enabledCommandIds: string[]) {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return;
  }
  const uniqueEnabledCommandIds = [...new Set(enabledCommandIds)];
  try {
    await runtimeInvoke(NATIVE_COMMANDS.syncAppMenuState, { enabledCommandIds: uniqueEnabledCommandIds });
  } catch {
    // Ignore sync failures so command execution path is not blocked.
  }
}

export function isWindowControlsAvailable() {
  return Boolean(getRuntimeInvoke());
}

export async function queryMainWindowMaximized() {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return false;
  }
  try {
    return (await runtimeInvoke(NATIVE_COMMANDS.windowIsMaximized)) === true;
  } catch {
    return false;
  }
}

export async function onMainWindowResized(handler: () => void): Promise<WindowResizeUnlisten> {
  const bridge = getElectronBridge();
  if (!bridge) {
    return null;
  }
  return bridge.onWindowResized(handler);
}

type WindowCommand =
  | typeof NATIVE_COMMANDS.windowMinimize
  | typeof NATIVE_COMMANDS.windowToggleMaximize
  | typeof NATIVE_COMMANDS.windowClose;

async function invokeWindowCommand(command: WindowCommand) {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return;
  }
  await runtimeInvoke(command);
}

export function minimizeMainWindow() {
  return invokeWindowCommand(NATIVE_COMMANDS.windowMinimize);
}

export function toggleMainWindowMaximize() {
  return invokeWindowCommand(NATIVE_COMMANDS.windowToggleMaximize);
}

export function closeMainWindow() {
  return invokeWindowCommand(NATIVE_COMMANDS.windowClose);
}
