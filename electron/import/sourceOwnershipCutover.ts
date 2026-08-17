import { computeSyncContentHash, upsertSyncObjectState } from '../../lib/core/database/syncState.js';
import {
  normalizeImportManagerSettings,
  type ImportManagerSettings,
  type ImportManagerSourceDraft
} from '../../lib/core/import/importManagerSettings.js';
import type { WatchedFolderBinding } from '../../lib/core/import/watchedFolderBinding.js';
import { openDatabaseConnection } from '../database/connection.js';
import { loadOrCreateDesktopDeviceId } from '../database/deviceIdentity.js';
import { loadJsonSetting, saveJsonSettingWithDriver } from '../database/settingsStore.js';

const SETTINGS_KEY = 'import_manager_settings';

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function sourcePayload(source: ImportManagerSourceDraft, updatedAt: string): WatchedFolderBinding {
  return {
    actionMode: source.actionMode, archivePath: source.archivePath, availability: 'unknown',
    bindingId: source.id, enabled: false,
    highlightMode: source.highlightMode, highlightPath: source.highlightPath, keepPreview: source.keepPreview,
    ownerDeviceName: null, ownerInstallationId: null, ownerPlatform: null,
    primaryPath: source.primaryPath, updatedAt
  };
}

function insertLegacyBinding(
  driver: ReturnType<typeof openDatabaseConnection>['driver'],
  source: ImportManagerSourceDraft,
  updatedAt: string,
  deviceId: string
) {
  if (!source.primaryPath.trim() && !source.highlightPath.trim()) return;
  const binding = sourcePayload(source, updatedAt);
  const result = driver.execute(
    `INSERT OR IGNORE INTO watched_folder_bindings (
      binding_id, owner_installation_id, owner_device_name, owner_platform,
      action_mode, archive_path, highlight_mode, highlight_path, keep_preview_json, primary_path,
      enabled, availability, created_at, updated_at, deleted_at
    ) VALUES (?, NULL, NULL, NULL, ?, ?, ?, ?, ?, ?, 0, 'unknown', ?, ?, NULL)`,
    [binding.bindingId, binding.actionMode, binding.archivePath, binding.highlightMode, binding.highlightPath,
      JSON.stringify(binding.keepPreview), binding.primaryPath, updatedAt, updatedAt]
  );
  if (result.changes === 0) return;
  upsertSyncObjectState(driver, {
    objectType: 'watched_folder', objectId: binding.bindingId,
    contentHash: computeSyncContentHash('watched_folder', JSON.parse(JSON.stringify(binding))),
    lastModifiedByDeviceId: deviceId, syncDirty: true, updatedAt
  });
}

export function isSourceOwnershipCutoverComplete() {
  return openDatabaseConnection().driver.queryOne<{ status: string }>(
    'SELECT status FROM source_ownership_cutover WHERE singleton_id = 1'
  )?.status === 'cutover';
}

export function ensureSourceOwnershipCutover() {
  if (isSourceOwnershipCutoverComplete()) return { cutover: true };
  const raw = loadJsonSetting(SETTINGS_KEY);
  const normalized = normalizeImportManagerSettings(raw);
  const now = new Date().toISOString();
  const deviceId = loadOrCreateDesktopDeviceId(now);
  const driver = openDatabaseConnection().driver;
  driver.transaction((tx) => {
    const current = tx.queryOne<{ status: string }>(
      'SELECT status FROM source_ownership_cutover WHERE singleton_id = 1'
    );
    if (current?.status === 'cutover') return;
    for (const source of normalized.sources) insertLegacyBinding(tx, source, now, deviceId);
    const withoutSources: Partial<ImportManagerSettings> & Record<string, unknown> = {
      ...normalized, ...record(raw), updatedAt: now
    };
    delete withoutSources.sources;
    saveJsonSettingWithDriver(tx, SETTINGS_KEY, withoutSources, now);
    tx.execute(
      `INSERT INTO source_ownership_cutover (singleton_id, status, cutover_at)
       VALUES (1, 'cutover', ?)
       ON CONFLICT(singleton_id) DO UPDATE SET status = 'cutover', cutover_at = excluded.cutover_at`,
      [now]
    );
  });
  return { cutover: true };
}
