import fs from 'node:fs';
import path from 'node:path';

import { app } from 'electron';

interface StoredBookmark {
  bookmark: string;
  path: string;
}

const activeBookmarks = new Map<string, () => void>();
const BOOKMARKS_FILENAME = 'security-scoped-bookmarks.json';

export function shouldRequestSecurityScopedBookmarks() {
  return process.mas === true;
}

export function persistSecurityScopedBookmark(selectedPath: string, bookmark: string | undefined) {
  if (!shouldRequestSecurityScopedBookmarks() || !bookmark) return;
  activateBookmark(selectedPath, bookmark);
  const stored = readStoredBookmarks();
  const next = [
    ...stored.filter((entry) => entry.path !== selectedPath),
    { bookmark, path: selectedPath }
  ];
  writeStoredBookmarks(next);
}

export function restoreSecurityScopedBookmarks() {
  if (!shouldRequestSecurityScopedBookmarks()) return;
  for (const entry of readStoredBookmarks()) activateBookmark(entry.path, entry.bookmark);
}

export function stopSecurityScopedBookmarks() {
  for (const stop of activeBookmarks.values()) stop();
  activeBookmarks.clear();
}

function activateBookmark(selectedPath: string, bookmark: string) {
  if (activeBookmarks.has(selectedPath)) return;
  try {
    const stopAccessing = app.startAccessingSecurityScopedResource(bookmark);
    activeBookmarks.set(selectedPath, () => stopAccessing());
  } catch {
    // A stale bookmark is left in place so the user can reselect the folder through the same UI.
  }
}

function readStoredBookmarks(): StoredBookmark[] {
  try {
    const parsed = JSON.parse(fs.readFileSync(resolveStorePath(), 'utf8')) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isStoredBookmark);
  } catch {
    return [];
  }
}

function writeStoredBookmarks(entries: StoredBookmark[]) {
  const target = resolveStorePath();
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(entries)}\n`, { mode: 0o600 });
}

function resolveStorePath() {
  return path.join(app.getPath('userData'), BOOKMARKS_FILENAME);
}

function isStoredBookmark(value: unknown): value is StoredBookmark {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Record<string, unknown>;
  return typeof entry.bookmark === 'string' && entry.bookmark.length > 0 &&
    typeof entry.path === 'string' && path.isAbsolute(entry.path);
}
