import fs from 'node:fs';
import path from 'node:path';

import { app } from 'electron';

import { isRunningInAppSandbox } from './appSandbox.js';
import { appendMainProcessDiagnosticLog } from './diagnostics/mainProcessDiagnostics.js';
import {
  loadMacosSecurityScopedBookmarkAdapter,
  type MacosSecurityScopedBookmarkAdapter,
  type NativeBookmarkSuccess
} from './macosSecurityScopedBookmarksNative.js';

interface StoredFileBookmark {
  bookmark: string;
  path: string;
}

export type FileBookmarkAccessResult =
  | { status: 'active' | 'not_required' }
  | { errorCode: string; message: string; status: 'error' };

const BOOKMARKS_FILENAME = 'macos-file-security-bookmarks.json';
const activeHandles = new Map<string, number>();

export function ensureMacosFileSecurityScopedAccess(filePath: string): FileBookmarkAccessResult {
  if (process.platform !== 'darwin' || !isRunningInAppSandbox()) return { status: 'not_required' };
  const absolutePath = path.resolve(filePath);
  if (activeHandles.has(absolutePath)) return { status: 'active' };
  const loaded = loadMacosSecurityScopedBookmarkAdapter();
  if (loaded.status !== 'ready') return adapterLoadFailure(loaded);
  const created = loaded.adapter.createAndStart(absolutePath);
  if (!created.ok) return nativeFailure(created);
  try {
    replaceStoredBookmark(absolutePath, created.bookmark);
    activeHandles.set(absolutePath, created.handle);
    return { status: 'active' };
  } catch (error) {
    loaded.adapter.stop(created.handle);
    return {
      errorCode: 'persist_failed',
      message: error instanceof Error ? error.message : String(error),
      status: 'error'
    };
  }
}

export function restoreMacosFileSecurityScopedBookmarks() {
  if (process.platform !== 'darwin' || !isRunningInAppSandbox()) return;
  const startedAt = Date.now();
  const loaded = loadMacosSecurityScopedBookmarkAdapter();
  if (loaded.status !== 'ready') {
    appendMainProcessDiagnosticLog('macos_file_bookmark_adapter_unavailable', loaded);
    return;
  }
  const stored = readStoredBookmarks();
  for (const entry of stored) restoreStoredBookmark(entry, stored, loaded.adapter);
  appendMainProcessDiagnosticLog('macos_file_bookmark_restore_complete', {
    activeCount: activeHandles.size,
    durationMs: Date.now() - startedAt,
    storedCount: stored.length
  });
}

export function stopMacosFileSecurityScopedBookmarks() {
  const loaded = loadMacosSecurityScopedBookmarkAdapter();
  if (loaded.status === 'ready') {
    for (const handle of activeHandles.values()) loaded.adapter.stop(handle);
  }
  activeHandles.clear();
}

function restoreStoredBookmark(
  entry: StoredFileBookmark,
  allEntries: StoredFileBookmark[],
  adapter: MacosSecurityScopedBookmarkAdapter
) {
  if (activeHandles.has(entry.path)) return;
  const resolved = adapter.resolveAndStart(entry.bookmark);
  if (!resolved.ok) {
    logRestoreFailure(entry.path, resolved.errorCode, resolved.message);
    return;
  }
  if (path.resolve(resolved.resolvedPath) !== entry.path) {
    adapter.stop(resolved.handle);
    logRestoreFailure(entry.path, 'resolved_path_changed', resolved.resolvedPath);
    return;
  }
  if (!resolved.stale) {
    activeHandles.set(entry.path, resolved.handle);
    return;
  }
  refreshStaleBookmark(entry, allEntries, resolved, adapter);
}

function refreshStaleBookmark(
  entry: StoredFileBookmark,
  allEntries: StoredFileBookmark[],
  resolved: NativeBookmarkSuccess,
  adapter: MacosSecurityScopedBookmarkAdapter
) {
  const refreshed = adapter.createAndStart(entry.path);
  if (!refreshed.ok) {
    activeHandles.set(entry.path, resolved.handle);
    logRestoreFailure(entry.path, refreshed.errorCode, refreshed.message);
    return;
  }
  try {
    writeStoredBookmarks(allEntries.map((item) => (
      item.path === entry.path ? { bookmark: refreshed.bookmark, path: entry.path } : item
    )));
    adapter.stop(resolved.handle);
    activeHandles.set(entry.path, refreshed.handle);
  } catch (error) {
    adapter.stop(refreshed.handle);
    activeHandles.set(entry.path, resolved.handle);
    logRestoreFailure(entry.path, 'stale_persist_failed', error instanceof Error ? error.message : String(error));
  }
}

function adapterLoadFailure(loaded: { message: string; status: string }): FileBookmarkAccessResult {
  return { errorCode: loaded.status, message: loaded.message, status: 'error' };
}

function nativeFailure(failure: { errorCode: string; message: string }): FileBookmarkAccessResult {
  return { errorCode: failure.errorCode, message: failure.message, status: 'error' };
}

function logRestoreFailure(filePath: string, errorCode: string, message: string) {
  appendMainProcessDiagnosticLog('macos_file_bookmark_restore_failed', {
    errorCode,
    filePath,
    message
  });
}

function replaceStoredBookmark(filePath: string, bookmark: string) {
  const stored = readStoredBookmarks();
  writeStoredBookmarks([
    ...stored.filter((entry) => entry.path !== filePath),
    { bookmark, path: filePath }
  ]);
}

function readStoredBookmarks(): StoredFileBookmark[] {
  try {
    const parsed = JSON.parse(fs.readFileSync(resolveStorePath(), 'utf8')) as unknown;
    if (!Array.isArray(parsed)) {
      logInvalidStore('invalid_shape');
      return [];
    }
    return parsed.filter(isStoredFileBookmark);
  } catch (error) {
    if (isMissingStore(error)) return [];
    logInvalidStore(error instanceof SyntaxError ? 'invalid_json' : 'read_failed');
    return [];
  }
}

function logInvalidStore(errorCode: string) {
  appendMainProcessDiagnosticLog('macos_file_bookmark_store_invalid', {
    errorCode,
    storePath: resolveStorePath()
  });
}

function isMissingStore(error: unknown) {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT');
}

function writeStoredBookmarks(entries: StoredFileBookmark[]) {
  const target = resolveStorePath();
  const temporary = `${target}.${process.pid}.tmp`;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(temporary, `${JSON.stringify(entries)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, target);
  fs.chmodSync(target, 0o600);
}

function resolveStorePath() {
  return path.join(app.getPath('userData'), BOOKMARKS_FILENAME);
}

function isStoredFileBookmark(value: unknown): value is StoredFileBookmark {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Record<string, unknown>;
  return typeof entry.bookmark === 'string' && entry.bookmark.length > 0 &&
    typeof entry.path === 'string' && path.isAbsolute(entry.path);
}
