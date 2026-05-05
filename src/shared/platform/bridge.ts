import { invoke } from '@tauri-apps/api/core';

import { isTauriRuntime } from './runtime';

const EXTERNAL_URL_WINDOW_FEATURES = 'noopener,noreferrer';
export type RuntimeInvoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>;

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
  if (!isTauriRuntime()) {
    return null;
  }
  return invoke as RuntimeInvoke;
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
      await runtimeInvoke('open_external_url', { url: resolvedUrl });
      return;
    } catch {
      // Fall back to browser behavior if native opener is unavailable.
    }
  }

  window.open(resolvedUrl, '_blank', EXTERNAL_URL_WINDOW_FEATURES);
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

export async function resolveRuntimeAppPaths(): Promise<RuntimeAppPaths | null> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return null;
  }
  try {
    const result = await runtimeInvoke('resolve_app_paths');
    return toRuntimeAppPaths(result);
  } catch {
    return null;
  }
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

export async function listRuntimeSystemFonts(): Promise<RuntimeSystemFontCatalog | null> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return null;
  }
  try {
    const result = await runtimeInvoke('list_system_fonts');
    return toRuntimeSystemFontCatalog(result);
  } catch {
    return null;
  }
}
