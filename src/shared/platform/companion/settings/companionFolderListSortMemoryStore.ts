import { useSyncExternalStore } from 'react';

import type { DbPort } from '../../../../../lib/core/sync/dbPort';
import {
  EMPTY_FOLDER_LIST_SORT_MEMORY,
  FOLDER_LIST_SORT_MEMORY_SETTING_KEY,
  parseFolderListSortMemoryPayload,
  withFolderListSortChoice,
  type FolderListSortMemoryEntry,
  type FolderListSortMemoryPayload
} from '../../../../../lib/platform/folderListSortMemoryContract';
import { getCompanionRuntimeCapability, hasCompanionLocalDatabase } from '../../companionRuntimeCapabilities';
import { readIosCompanionDatabase, writeIosCompanionDatabase } from '../runtime/iosCompanionActiveDatabase';
import { saveIosSettingWithDb } from '../runtime/iosCompanionActiveDatabaseWrites';
import { runCompanionSyncMutationTask } from '../sync/mutation/companionSyncMutationRevision';

/** Phones keep one set of per-list sort choices per library, apart from the desktops' set. */
const PHONE_FORM_FACTOR = 'phone';
const listeners = new Set<() => void>();
let snapshot: FolderListSortMemoryPayload = EMPTY_FOLDER_LIST_SORT_MEMORY;
let pendingSave: Promise<unknown> = Promise.resolve();

function publish(next: FolderListSortMemoryPayload) {
  if (JSON.stringify(next) === JSON.stringify(snapshot)) return;
  snapshot = next;
  listeners.forEach(listener => listener());
}

async function readPhonePayload(db: DbPort) {
  const [row] = await db.query<{ value_json: string }>(
    `SELECT value_json FROM setting_records WHERE key = ? AND scope = 'user_space' AND form_factor = ?
      AND deleted_at IS NULL ORDER BY updated_at DESC, content_hash DESC LIMIT 1`,
    [FOLDER_LIST_SORT_MEMORY_SETTING_KEY, PHONE_FORM_FACTOR]
  );
  if (!row) return EMPTY_FOLDER_LIST_SORT_MEMORY;
  try {
    return parseFolderListSortMemoryPayload(JSON.parse(row.value_json));
  } catch {
    return EMPTY_FOLDER_LIST_SORT_MEMORY;
  }
}

function hasDatabase() {
  return hasCompanionLocalDatabase(getCompanionRuntimeCapability());
}

/** Loads the open library's phone sort choices; called when a library opens and after sync applies other phones' choices. */
export async function hydrateCompanionFolderListSortMemory() {
  if (!hasDatabase()) {
    publish(EMPTY_FOLDER_LIST_SORT_MEMORY);
    return snapshot;
  }
  await pendingSave.catch(() => undefined);
  publish(await readIosCompanionDatabase(readPhonePayload));
  return snapshot;
}

export function readCompanionFolderListSort(listId: string | null): FolderListSortMemoryEntry | null {
  return listId ? snapshot.sortByListId[listId] ?? null : null;
}

/**
 * Applies the choice at once and saves the whole set behind any earlier save. Choosing the list's default removes its
 * record; `isKnownList` drops records of lists that no longer exist while saving.
 */
export function rememberCompanionFolderListSort(
  listId: string,
  choice: FolderListSortMemoryEntry,
  fallback: FolderListSortMemoryEntry,
  isKnownList: (listId: string) => boolean = () => true
) {
  const chosen = withFolderListSortChoice(snapshot, listId, choice, fallback);
  const sortByListId = Object.fromEntries(Object.entries(chosen.sortByListId)
    .filter(([id]) => id === listId || isKnownList(id)));
  const next = { ...chosen, sortByListId };
  if (JSON.stringify(next) === JSON.stringify(snapshot)) return pendingSave;
  publish(next);
  if (!hasDatabase()) return pendingSave;
  const payload = next;
  pendingSave = pendingSave
    .catch(() => undefined)
    .then(() => runCompanionSyncMutationTask(() => writeIosCompanionDatabase(db => db.transaction(tx =>
      saveIosSettingWithDb(tx, {
        form_factor: PHONE_FORM_FACTOR,
        key: FOLDER_LIST_SORT_MEMORY_SETTING_KEY,
        scope: 'user_space',
        value_json: JSON.stringify(payload)
      })), { kind: 'business' }), { kind: 'nodes', nodeIds: [] }))
    .catch((error: unknown) => console.warn('[folder-list-sort-memory] save failed', error));
  return pendingSave;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function getSnapshot() {
  return snapshot;
}

export function useCompanionFolderListSortMemory() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function resetCompanionFolderListSortMemoryForTests() {
  snapshot = EMPTY_FOLDER_LIST_SORT_MEMORY;
  pendingSave = Promise.resolve();
  listeners.clear();
}
