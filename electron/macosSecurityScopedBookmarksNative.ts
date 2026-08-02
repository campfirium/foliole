import { createRequire } from 'node:module';

export interface NativeBookmarkSuccess {
  bookmark: string;
  handle: number;
  ok: true;
  resolvedPath: string;
  stale: boolean;
}

export interface NativeBookmarkFailure {
  errorCode: string;
  message: string;
  ok: false;
}

export type NativeBookmarkResult = NativeBookmarkSuccess | NativeBookmarkFailure;
export type NativeAppGroupContainerResult =
  | { ok: true; path: string }
  | NativeBookmarkFailure;
export type NativeLegacySafeStorageResult =
  | { ok: true; plaintext: string }
  | NativeBookmarkFailure;

export interface MacosSecurityScopedBookmarkAdapter {
  appGroupContainerPath: (identifier: string) => NativeAppGroupContainerResult;
  createAndStart: (filePath: string) => NativeBookmarkResult;
  decryptLegacyMasSafeStorage: (encrypted: Buffer) => NativeLegacySafeStorageResult;
  resolveAndStart: (bookmark: string) => NativeBookmarkResult;
  stop: (handle: number) => boolean;
}

export type NativeBookmarkAdapterLoadResult =
  | { adapter: MacosSecurityScopedBookmarkAdapter; status: 'ready' }
  | { message: string; status: 'module_unavailable' | 'platform_not_supported' };

let cachedResult: NativeBookmarkAdapterLoadResult | null = null;

export function loadMacosSecurityScopedBookmarkAdapter(
  platform: NodeJS.Platform = process.platform
): NativeBookmarkAdapterLoadResult {
  if (platform !== 'darwin') return { message: 'macOS only', status: 'platform_not_supported' };
  if (cachedResult) return cachedResult;
  try {
    const require = createRequire(import.meta.url);
    const adapter = require('@foliole/macos-security-bookmarks') as MacosSecurityScopedBookmarkAdapter;
    cachedResult = { adapter, status: 'ready' };
  } catch (error) {
    cachedResult = {
      message: error instanceof Error ? error.message : String(error),
      status: 'module_unavailable'
    };
  }
  return cachedResult;
}

export function resetMacosSecurityScopedBookmarkAdapterForTests() {
  cachedResult = null;
}
