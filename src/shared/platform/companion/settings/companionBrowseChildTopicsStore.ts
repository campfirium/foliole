import { useSyncExternalStore } from 'react';

import type { DbPort } from '../../../../../lib/core/sync/dbPort';
import { getCompanionRuntimeCapability, hasCompanionLocalDatabase } from '../../companionRuntimeCapabilities';
import { getCompanionReadingScope } from '../reading/companionReadingScope';
import { readIosCompanionDatabase, writeIosCompanionDatabase } from '../runtime/iosCompanionActiveDatabase';
import { saveIosSettingWithDb } from '../runtime/iosCompanionActiveDatabaseWrites';
import { iosCompanionHostName } from '../runtime/iosCompanionMutationState';
import { runCompanionSyncMutationTask } from '../sync/mutation/companionSyncMutationRevision';

/**
 * This phone's choice to list child topics on the Browse home list. It lives in the library database rather than
 * WebView storage, which Android may not have written to disk yet when the app is force-stopped.
 */
export const COMPANION_BROWSE_SHOW_CHILD_TOPICS_SETTING_KEY = 'companion_browse_show_child_topics';
const PHONE_FORM_FACTOR = 'phone';
// Retired WebView key, read only to migrate already-installed copies.
const LEGACY_STORAGE_KEY = 'foliole-companion-browse-show-child-topics';
const listeners = new Set<() => void>();
let shown = true;
let pendingSave: Promise<unknown> = Promise.resolve();

export class CompanionBrowseChildTopicsMigrationError extends Error {}

function publish(next: boolean) {
  if (next === shown) return;
  shown = next;
  listeners.forEach(listener => listener());
}

function hasDatabase() {
  return hasCompanionLocalDatabase(getCompanionRuntimeCapability());
}

async function readShown(db: DbPort) {
  const hostName = await iosCompanionHostName(db);
  const [row] = await db.query<{ value_json: string }>(
    `SELECT value_json FROM setting_records WHERE key = ? AND scope = 'host' AND form_factor = ? AND host_name = ?
      AND deleted_at IS NULL ORDER BY updated_at DESC, content_hash DESC LIMIT 1`,
    [COMPANION_BROWSE_SHOW_CHILD_TOPICS_SETTING_KEY, PHONE_FORM_FACTOR, hostName]
  );
  if (!row) return undefined;
  try {
    return JSON.parse(row.value_json) !== false;
  } catch {
    return true;
  }
}

function readLegacyChoice() {
  try {
    const value = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (value === 'true' || value === 'false') return value;
  } catch {
    // WebView storage may be disabled. The library setting is still available.
  }
}

function saveShown(db: DbPort, value: boolean) {
  return saveIosSettingWithDb(db, {
    form_factor: PHONE_FORM_FACTOR,
    key: COMPANION_BROWSE_SHOW_CHILD_TOPICS_SETTING_KEY,
    scope: 'host',
    value_json: JSON.stringify(value)
  });
}

function migrateLegacyChoice(scope: object) {
  return runCompanionSyncMutationTask(async () => {
    if (scope !== getCompanionReadingScope()) return undefined;
    const legacy = readLegacyChoice();
    if (legacy === undefined) return readIosCompanionDatabase(readShown);
    const value = await writeIosCompanionDatabase(db => db.transaction(async tx => {
      const saved = await readShown(tx);
      if (saved !== undefined) return saved;
      const migrated = legacy === 'true';
      await saveShown(tx, migrated);
      return migrated;
    }), { kind: 'business' });
    try {
      window.localStorage.removeItem(LEGACY_STORAGE_KEY);
    } catch {
      // A later hydration can retry cleanup. The committed database value takes precedence.
    }
    return value;
  }, { kind: 'nodes', nodeIds: [] });
}

/** Loads this phone's choice for the open library; called when a library opens, before Browse is shown. */
export async function hydrateCompanionBrowseShowChildTopics() {
  if (!hasDatabase()) return shown;
  const scope = getCompanionReadingScope();
  await pendingSave.catch(() => undefined);
  if (scope !== getCompanionReadingScope()) return shown;
  const legacy = readLegacyChoice();
  if (legacy === undefined) {
    const value = await readIosCompanionDatabase(readShown);
    if (scope === getCompanionReadingScope()) publish(value ?? true);
  } else {
    try {
      const value = await migrateLegacyChoice(scope);
      if (scope === getCompanionReadingScope()) publish(value ?? true);
    } catch (error) {
      if (scope !== getCompanionReadingScope()) return shown;
      // The old key remains available for a retry. If the transaction committed and only its
      // follow-up failed, prefer the value the library already holds.
      const saved = await readIosCompanionDatabase(readShown);
      if (scope === getCompanionReadingScope()) publish(saved ?? (legacy === 'true'));
      throw new CompanionBrowseChildTopicsMigrationError(error instanceof Error ? error.message : String(error), { cause: error });
    }
  }
  return shown;
}

export function getCompanionBrowseShowChildTopics() {
  return shown;
}

/** Applies the switch at once and saves it behind any earlier save. */
export function toggleCompanionBrowseShowChildTopics() {
  const next = !shown;
  publish(next);
  if (!hasDatabase()) return pendingSave;
  pendingSave = pendingSave
    .catch(() => undefined)
    .then(() => runCompanionSyncMutationTask(() => writeIosCompanionDatabase(db => db.transaction(tx => saveShown(tx, next)), { kind: 'business' }), { kind: 'nodes', nodeIds: [] }))
    .catch((error: unknown) => console.warn('[browse-child-topics] save failed', error));
  return pendingSave;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useCompanionBrowseShowChildTopics() {
  return useSyncExternalStore(subscribe, getCompanionBrowseShowChildTopics, getCompanionBrowseShowChildTopics);
}

export function resetCompanionBrowseShowChildTopicsForTests() {
  shown = true;
  pendingSave = Promise.resolve();
  listeners.clear();
}
