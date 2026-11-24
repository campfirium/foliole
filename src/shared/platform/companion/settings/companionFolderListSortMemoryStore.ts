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
import { getCompanionReadingScope } from '../reading/companionReadingScope';
import { readIosCompanionDatabase, writeIosCompanionDatabase } from '../runtime/iosCompanionActiveDatabase';
import { saveIosSettingWithDb } from '../runtime/iosCompanionActiveDatabaseWrites';
import { runCompanionSyncMutationTask } from '../sync/mutation/companionSyncMutationRevision';

/** Phones keep one set of per-list sort choices per library, apart from the desktops' set. */
const PHONE_FORM_FACTOR = 'phone';
const listeners = new Set<() => void>();
let snapshot: FolderListSortMemoryPayload = EMPTY_FOLDER_LIST_SORT_MEMORY;
let pendingSave: Promise<void> = Promise.resolve();
let revision = 0;

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
  const readRevision = revision;
  const scope = getCompanionReadingScope();
  if (!hasDatabase()) {
    publish(EMPTY_FOLDER_LIST_SORT_MEMORY);
    return snapshot;
  }
  await pendingSave;
  if (scope !== getCompanionReadingScope() || readRevision !== revision) return snapshot;
  const result = await readIosCompanionDatabase(readPhonePayload);
  if (scope === getCompanionReadingScope() && readRevision === revision) publish(result);
  return snapshot;
}

export function readCompanionFolderListSort(listId: string | null): FolderListSortMemoryEntry | null {
  return listId ? snapshot.sortByListId[listId] ?? null : null;
}

type PhoneSortEdit = {
  listId: string;
  choice: FolderListSortMemoryEntry;
  fallback: FolderListSortMemoryEntry;
  isKnownList: (listId: string) => boolean;
};

function pruneUnknownLists(payload: FolderListSortMemoryPayload, isKnownList: (id: string) => boolean) {
  const sortByListId = Object.fromEntries(Object.entries(payload.sortByListId).filter(([id]) => isKnownList(id)));
  return { ...payload, sortByListId };
}

async function persistSortEdit(db: DbPort, { listId, choice, fallback, isKnownList }: PhoneSortEdit) {
  const current = await readPhonePayload(db);
  const chosen = withFolderListSortChoice(current, listId, choice, fallback);
  const mayBeMissing = Object.keys(chosen.sortByListId).filter(id => id !== listId && !isKnownList(id));
  // The directory projection can trail an incoming commit. Confirm missing nodes against SQLite before pruning.
  const existing = mayBeMissing.length ? await db.query<{ id: string }>(
    'SELECT id FROM nodes WHERE id IN (SELECT value FROM json_each(?))', [JSON.stringify(mayBeMissing)]
  ) : [];
  const existingIds = new Set(existing.map(row => row.id));
  const next = pruneUnknownLists(chosen, id => id === listId || isKnownList(id) || existingIds.has(id));
  if (JSON.stringify(current) !== JSON.stringify(next)) {
    await saveIosSettingWithDb(db, {
      form_factor: PHONE_FORM_FACTOR,
      key: FOLDER_LIST_SORT_MEMORY_SETTING_KEY,
      scope: 'user_space',
      value_json: JSON.stringify(next)
    });
  }
  return next;
}

/** Shows an edit immediately and applies it to the committed document when its write runs. */
export function rememberCompanionFolderListSort(
  listId: string,
  choice: FolderListSortMemoryEntry,
  fallback: FolderListSortMemoryEntry,
  isKnownList: (listId: string) => boolean = () => true
) {
  const scope = getCompanionReadingScope();
  const edit = { listId, choice, fallback, isKnownList };
  const writeRevision = ++revision;
  publish(withFolderListSortChoice(snapshot, listId, choice, fallback));
  if (!hasDatabase()) return pendingSave;
  pendingSave = pendingSave.then(async () => {
    if (scope !== getCompanionReadingScope()) return;
    const saved = await runCompanionSyncMutationTask(() =>
      writeIosCompanionDatabase(db => db.transaction(tx =>
        scope === getCompanionReadingScope() ? persistSortEdit(tx, edit) : Promise.resolve(null)
      ), { kind: 'business' }), { kind: 'nodes', nodeIds: [] });
    if (saved && scope === getCompanionReadingScope() && writeRevision === revision) publish(saved);
  }).catch((error: unknown) => console.warn('[folder-list-sort-memory] save failed', error));
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
  revision++;
  listeners.clear();
}
