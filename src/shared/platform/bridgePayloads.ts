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

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function toRuntimeAppPaths(value: unknown): RuntimeAppPaths | null {
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

export function toRuntimeSystemFontCatalog(value: unknown): RuntimeSystemFontCatalog | null {
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
