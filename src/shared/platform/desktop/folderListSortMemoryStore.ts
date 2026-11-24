import { useSyncExternalStore } from 'react';

import {
  EMPTY_FOLDER_LIST_SORT_MEMORY,
  parseFolderListSortMemoryPayload,
  withFolderListSortChoice,
  type FolderListSortMemoryEntry,
  type FolderListSortMemoryPayload
} from '../../../../lib/platform/folderListSortMemoryContract';
import { NATIVE_COMMANDS } from '../../../../lib/platform/nativeCommands';
import { getRuntimeInvoke } from '../runtimeInvoke';

const DEMO_STORAGE_KEY = 'foliole-demo-folder-list-sort-memory-v1';
const listeners = new Set<() => void>();
let snapshot: FolderListSortMemoryPayload = EMPTY_FOLDER_LIST_SORT_MEMORY;
let pendingSave: Promise<unknown> = Promise.resolve();
type LibraryContext = { demo: boolean; libraryScope?: string | undefined };
let context: LibraryContext = { demo: false };
let revision = 0;

function publish(next: FolderListSortMemoryPayload) {
  if (JSON.stringify(next) === JSON.stringify(snapshot)) return;
  snapshot = next;
  listeners.forEach((listener) => listener());
}

function readDemoPayload() {
  try {
    const raw = window.localStorage.getItem(DEMO_STORAGE_KEY);
    return parseFolderListSortMemoryPayload(raw ? JSON.parse(raw) : null);
  } catch {
    return EMPTY_FOLDER_LIST_SORT_MEMORY;
  }
}

/** Loads the desktop choices after startup, a library switch or an incoming sort setting. */
export async function hydrateFolderListSortMemory(options: LibraryContext) {
  if (context.demo !== options.demo || context.libraryScope !== options.libraryScope) {
    context = options;
    pendingSave = Promise.resolve();
    publish(EMPTY_FOLDER_LIST_SORT_MEMORY);
  }
  const readRevision = ++revision;
  if (options.demo) {
    publish(readDemoPayload());
    return;
  }
  const invoke = getRuntimeInvoke();
  const { libraryScope } = options;
  if (!invoke || !libraryScope) return;

  await pendingSave;
  if (readRevision !== revision) return;
  const result = await invoke(NATIVE_COMMANDS.loadFolderListSortMemory, { libraryScope });
  if (readRevision === revision) {
    publish(parseFolderListSortMemoryPayload(result));
  }
}

export function getFolderListSortMemorySnapshot() {
  return snapshot;
}

export function readRememberedFolderListSort(listId: string | null | undefined): FolderListSortMemoryEntry | null {
  return listId ? snapshot.sortByListId[listId] ?? null : null;
}

/** Applies the choice at once and saves it behind any earlier save, so quick key-then-direction changes keep order. */
export function rememberFolderListSort(
  listId: string,
  choice: FolderListSortMemoryEntry,
  fallback: FolderListSortMemoryEntry
) {
  const target = context;
  const { demo, libraryScope } = target;
  const invoke = getRuntimeInvoke();
  if (invoke && !demo && !libraryScope) return;

  const next = withFolderListSortChoice(snapshot, listId, choice, fallback);
  // The database can already have a different choice when the renderer still shows the default.
  if ((demo || !invoke) && JSON.stringify(next) === JSON.stringify(snapshot)) return;
  const writeRevision = ++revision;
  publish(next);
  if (demo) {
    try {
      window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // The demo keeps the choice for this session when storage is unavailable.
    }
    return;
  }
  if (!invoke || !libraryScope) return;
  pendingSave = pendingSave.then(async () => {
    if (context !== target) return;
    const result = await invoke(NATIVE_COMMANDS.saveFolderListSortMemory, { choice, fallback, libraryScope, listId });
    if (writeRevision === revision) publish(parseFolderListSortMemoryPayload(result));
  }).catch((error: unknown) => console.warn('[folder-list-sort-memory] save failed', error));
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useFolderListSortMemorySnapshot() {
  return useSyncExternalStore(subscribe, getFolderListSortMemorySnapshot, getFolderListSortMemorySnapshot);
}

export function resetFolderListSortMemoryForTests() {
  snapshot = EMPTY_FOLDER_LIST_SORT_MEMORY;
  pendingSave = Promise.resolve();
  context = { demo: false };
  revision++;
  listeners.clear();
}
