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
let demoMode = false;

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

/** Loads the library's desktop sort choices; called at start and after sync applies another desktop's choices. */
export async function hydrateFolderListSortMemory(options: { demo: boolean }) {
  demoMode = options.demo;
  if (options.demo) {
    publish(readDemoPayload());
    return;
  }
  const invoke = getRuntimeInvoke();
  if (!invoke) return;
  await pendingSave;
  publish(parseFolderListSortMemoryPayload(await invoke(NATIVE_COMMANDS.loadFolderListSortMemory)));
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
  const next = withFolderListSortChoice(snapshot, listId, choice, fallback);
  if (JSON.stringify(next) === JSON.stringify(snapshot)) return;
  publish(next);
  if (demoMode) {
    try {
      window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // The demo keeps the choice for this session when storage is unavailable.
    }
    return;
  }
  const invoke = getRuntimeInvoke();
  if (!invoke) return;
  pendingSave = pendingSave
    .catch(() => undefined)
    .then(() => invoke(NATIVE_COMMANDS.saveFolderListSortMemory, { payload: snapshot }))
    .catch((error: unknown) => console.warn('[folder-list-sort-memory] save failed', error));
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
  demoMode = false;
  listeners.clear();
}
