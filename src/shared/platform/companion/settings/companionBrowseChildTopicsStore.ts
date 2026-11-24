import { useSyncExternalStore } from 'react';

import type { DbPort } from '../../../../../lib/core/sync/dbPort';
import { getCompanionRuntimeCapability, hasCompanionLocalDatabase } from '../../companionRuntimeCapabilities';
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
const listeners = new Set<() => void>();
let shown = true;
let pendingSave: Promise<unknown> = Promise.resolve();

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
  if (!row) return true;
  try {
    return JSON.parse(row.value_json) !== false;
  } catch {
    return true;
  }
}

/** Loads this phone's choice for the open library; called when a library opens, before Browse is shown. */
export async function hydrateCompanionBrowseShowChildTopics() {
  if (!hasDatabase()) return shown;
  await pendingSave.catch(() => undefined);
  publish(await readIosCompanionDatabase(readShown));
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
    .then(() => runCompanionSyncMutationTask(() => writeIosCompanionDatabase(db => db.transaction(tx =>
      saveIosSettingWithDb(tx, {
        form_factor: PHONE_FORM_FACTOR,
        key: COMPANION_BROWSE_SHOW_CHILD_TOPICS_SETTING_KEY,
        scope: 'host',
        value_json: JSON.stringify(next)
      })), { kind: 'business' }), { kind: 'nodes', nodeIds: [] }))
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
