import { randomUUID } from 'node:crypto';
import fs from 'node:fs';

import type { DatabaseDriver } from '../../lib/core/database/driver.js';
import { computeSyncContentHash, upsertSyncObjectState } from '../../lib/core/database/syncState.js';
import type { ImportManagerSourceDraft } from '../../lib/core/import/importManagerSettings.js';
import type { WatchedFolderBinding } from '../../lib/core/import/watchedFolderBinding.js';
import { openDatabaseConnection } from '../database/connection.js';
import { loadOrCreateDesktopDeviceId } from '../database/deviceIdentity.js';
import { loadOrCreateDesktopInstallationIdentity } from '../desktopInstallationIdentity.js';

import {
  ensureWatchedFolderClaimReceipts,
  isWatchedFolderClaimConfirmed
} from './watchedFolderClaimDelivery.js';

interface BindingRow {
  [key: string]: null | number | string;
  action_mode: ImportManagerSourceDraft['actionMode']; archive_path: string; availability: string;
  binding_id: string; claim_revision: string | null; claim_state: WatchedFolderBinding['claimState'];
  enabled: number; highlight_mode: WatchedFolderBinding['highlightMode']; highlight_path: string;
  keep_preview_json: string | null; owner_device_name: string | null; owner_installation_id: string | null;
  owner_platform: string | null; primary_path: string; updated_at: string;
}

function parsePreview(value: string | null) {
  if (!value) return null;
  try { return JSON.parse(value) as ImportManagerSourceDraft['keepPreview']; } catch { return null; }
}

function toBinding(row: BindingRow): WatchedFolderBinding {
  return {
    actionMode: row.action_mode, archivePath: row.archive_path, availability: row.availability,
    bindingId: row.binding_id, claimRevision: row.claim_revision, claimState: row.claim_state,
    enabled: row.enabled === 1, highlightMode: row.highlight_mode, highlightPath: row.highlight_path,
    keepPreview: parsePreview(row.keep_preview_json), ownerDeviceName: row.owner_device_name,
    ownerInstallationId: row.owner_installation_id, ownerPlatform: row.owner_platform,
    primaryPath: row.primary_path, updatedAt: row.updated_at
  };
}

function loadBindings(driver: DatabaseDriver) {
  return driver.queryAll<BindingRow>(
    `SELECT * FROM watched_folder_bindings WHERE deleted_at IS NULL
     ORDER BY owner_device_name, owner_installation_id, created_at, binding_id`
  ).map(toBinding);
}

function recordSync(driver: DatabaseDriver, binding: WatchedFolderBinding, updatedAt: string, deviceId: string) {
  upsertSyncObjectState(driver, {
    objectType: 'watched_folder', objectId: binding.bindingId,
    contentHash: computeSyncContentHash('watched_folder', JSON.parse(JSON.stringify(binding))),
    lastModifiedByDeviceId: deviceId, syncDirty: true, updatedAt
  });
}

function promoteConfirmedClaims(driver: DatabaseDriver, now: string, deviceId: string) {
  const proposed = loadBindings(driver).filter((binding) => binding.claimState === 'proposed');
  for (const binding of proposed) {
    if (!isWatchedFolderClaimConfirmed(driver, binding.bindingId)) continue;
    driver.execute(
      `UPDATE watched_folder_bindings SET claim_state = 'claimed', updated_at = ?
       WHERE binding_id = ? AND claim_state = 'proposed'`,
      [now, binding.bindingId]
    );
    recordSync(driver, { ...binding, claimState: 'claimed', updatedAt: now }, now, deviceId);
  }
}

export function loadWatchedFolderBindings() {
  const driver = openDatabaseConnection().driver;
  const now = new Date().toISOString();
  promoteConfirmedClaims(driver, now, loadOrCreateDesktopDeviceId(now));
  return loadBindings(driver);
}

export function recordWatchedBindingSync(binding: WatchedFolderBinding, updatedAt = binding.updatedAt) {
  const driver = openDatabaseConnection().driver;
  recordSync(driver, binding, updatedAt, loadOrCreateDesktopDeviceId(updatedAt));
}

export function insertUnassignedWatchedSource(source: ImportManagerSourceDraft, createdAt: string) {
  const driver = openDatabaseConnection().driver;
  const bindingId = source.id.trim() || `watched-${randomUUID()}`;
  driver.execute(
    `INSERT OR IGNORE INTO watched_folder_bindings (
      binding_id, owner_installation_id, owner_device_name, owner_platform, claim_state, claim_revision,
      action_mode, archive_path, highlight_mode, highlight_path, keep_preview_json, primary_path,
      enabled, availability, created_at, updated_at, deleted_at
    ) VALUES (?, NULL, NULL, NULL, 'unassigned', NULL, ?, ?, ?, ?, ?, ?, 0, 'unknown', ?, ?, NULL)`,
    [bindingId, source.actionMode, source.archivePath, source.highlightMode, source.highlightPath,
      JSON.stringify(source.keepPreview), source.primaryPath, createdAt, createdAt]
  );
  const binding = loadBindings(driver).find((item) => item.bindingId === bindingId);
  if (binding) recordSync(driver, binding, createdAt, loadOrCreateDesktopDeviceId(createdAt));
  return binding ?? null;
}

export function saveLocalWatchedSources(sources: ImportManagerSourceDraft[], updatedAt: string) {
  const driver = openDatabaseConnection().driver;
  const identity = loadOrCreateDesktopInstallationIdentity();
  const deviceId = loadOrCreateDesktopDeviceId(updatedAt);
  driver.transaction((tx) => {
    const current = new Map(loadBindings(tx).map((binding) => [binding.bindingId, binding]));
    for (const source of sources) {
      const existing = current.get(source.id);
      if (existing?.ownerInstallationId && existing.ownerInstallationId !== identity.installationId) continue;
      if (existing?.claimState === 'unassigned' && source.ownership?.claimState !== 'proposed') continue;
      const validPath = isDirectory(source.primaryPath) &&
        (source.highlightMode !== 'split' || isDirectory(source.highlightPath));
      const canPropose = validPath && (!existing || existing.claimState === 'unassigned');
      const claimState = canPropose ? 'proposed' : existing?.claimState ?? 'unassigned';
      const ownerId = canPropose ? identity.installationId : existing?.ownerInstallationId ?? null;
      const revision = canPropose ? randomUUID() : existing?.claimRevision ?? null;
      const binding: WatchedFolderBinding = {
        actionMode: source.actionMode, archivePath: source.archivePath,
        availability: validPath ? 'available' : 'missing', bindingId: source.id,
        claimRevision: revision, claimState, enabled: claimState === 'claimed' && source.keepState === 'enabled',
        highlightMode: source.highlightMode, highlightPath: source.highlightPath,
        keepPreview: source.keepPreview, ownerDeviceName: ownerId ? identity.deviceName : null,
        ownerInstallationId: ownerId, ownerPlatform: ownerId ? identity.platform : null,
        primaryPath: source.primaryPath, updatedAt
      };
      upsertBinding(tx, binding, existing ? null : updatedAt);
      recordSync(tx, binding, updatedAt, deviceId);
      if (binding.claimState === 'proposed') {
        ensureWatchedFolderClaimReceipts(tx, binding.bindingId);
      }
      current.delete(source.id);
    }
    for (const binding of current.values()) {
      if (binding.ownerInstallationId !== identity.installationId) continue;
      tx.execute('UPDATE watched_folder_bindings SET deleted_at = ?, enabled = 0, updated_at = ? WHERE binding_id = ?',
        [updatedAt, updatedAt, binding.bindingId]);
      upsertSyncObjectState(tx, {
        objectType: 'watched_folder', objectId: binding.bindingId,
        contentHash: computeSyncContentHash('watched_folder', null), deletedAt: updatedAt,
        lastModifiedByDeviceId: deviceId, syncDirty: true, updatedAt
      });
    }
  });
}

export function loadLocalExecutableWatchedBindings() {
  const identity = loadOrCreateDesktopInstallationIdentity();
  return loadWatchedFolderBindings().filter((binding) =>
    binding.ownerInstallationId === identity.installationId &&
    binding.claimState === 'claimed' && binding.enabled && binding.availability === 'available'
  );
}

function isDirectory(value: string) {
  if (!value.trim()) return false;
  try { return fs.statSync(value).isDirectory(); } catch { return false; }
}

function upsertBinding(driver: DatabaseDriver, binding: WatchedFolderBinding, createdAt: string | null) {
  driver.execute(
    `INSERT INTO watched_folder_bindings (
      binding_id, owner_installation_id, owner_device_name, owner_platform, claim_state, claim_revision,
      action_mode, archive_path, highlight_mode, highlight_path, keep_preview_json, primary_path,
      enabled, availability, created_at, updated_at, deleted_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
    ON CONFLICT(binding_id) DO UPDATE SET owner_installation_id = excluded.owner_installation_id,
      owner_device_name = excluded.owner_device_name, owner_platform = excluded.owner_platform,
      claim_state = excluded.claim_state, claim_revision = excluded.claim_revision,
      action_mode = excluded.action_mode, archive_path = excluded.archive_path,
      highlight_mode = excluded.highlight_mode, highlight_path = excluded.highlight_path,
      keep_preview_json = excluded.keep_preview_json, primary_path = excluded.primary_path,
      enabled = excluded.enabled, availability = excluded.availability, updated_at = excluded.updated_at, deleted_at = NULL`,
    [binding.bindingId, binding.ownerInstallationId, binding.ownerDeviceName, binding.ownerPlatform,
      binding.claimState, binding.claimRevision, binding.actionMode, binding.archivePath, binding.highlightMode,
      binding.highlightPath, JSON.stringify(binding.keepPreview), binding.primaryPath, binding.enabled ? 1 : 0,
      binding.availability, createdAt ?? binding.updatedAt, binding.updatedAt]
  );
}
