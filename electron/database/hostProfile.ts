import type { DatabaseDriver } from '../../lib/core/database/driver.js';
import { computeSyncContentHash } from '../../lib/core/database/syncState.js';
import { withoutNodeViewStateHashSource } from '../../lib/platform/persistedNodeViewState.js';

import { openDatabaseConnection, type DatabaseConnection } from './connection.js';
import { updateLocalDesktopSourceHosts } from './desktopSources.js';
import { saveApprovedSyncGroupMember } from './syncGroupMemberRegistration.js';

const HOST_NAME_KEY = 'host_name';
const LEGACY_DEVICE_KEYS = ['device_id', 'desktop_device_id'] as const;

export function loadDesktopHostName(): string | null {
  return readSetting(openDatabaseConnection().driver, HOST_NAME_KEY);
}

export function loadOrCreateDesktopHostName(now = new Date().toISOString()) {
  void now;
  const hostName = loadDesktopHostName();
  if (hostName) return hostName;
  throw new Error('Desktop host profile is unavailable before database initialization.');
}

export function migrateDesktopHostProfile(
  connection: DatabaseConnection,
  currentHostName: string,
  now = new Date().toISOString()
) {
  const current = normalize(currentHostName);
  if (!current) throw new Error('Desktop system Host is unavailable.');
  const previous = readSetting(connection.driver, HOST_NAME_KEY) ?? readLegacyName(connection.driver) ?? current;
  ensureLegacyIdentity(connection.driver, previous, now);
  if (previous !== current) transferSyncGroupHost(connection.driver, current, now);
  if (previous !== current) transferHostState(connection.driver, previous, current);
  if (previous !== current) updateLocalDesktopSourceHosts({
    currentHostName: current,
    currentHostPlatform: process.platform,
    driver: connection.driver,
    previousHostName: previous,
    updatedAt: now
  });
  rewritePrivateObjectIds(connection.driver, previous, current);
  rehashPrivateObjects(connection.driver, current);
  pruneOtherHosts(connection.driver, current);
  pruneOtherHostObjectState(connection.driver, current);
  writeSetting(connection.driver, HOST_NAME_KEY, current, now);
  connection.driver.execute("DELETE FROM settings WHERE key = 'device_identity_reset_pending'");
  return { changed: previous !== current, currentHostName: current, previousHostName: previous };
}

function transferSyncGroupHost(driver: DatabaseDriver, current: string, now: string) {
  const local = driver.queryOne<{
    approved_by_host_name: string;
    authorization_id: string;
    group_id: string;
    host_name: string;
    host_platform: string;
  }>(`SELECT m.approved_by_host_name, m.authorization_id, m.group_id,
             m.host_name, m.host_platform
      FROM sync_group_local_state l
      JOIN sync_group_members m ON m.group_id = l.group_id AND m.host_name = l.local_host_name
      WHERE l.singleton_id = 1 AND m.state = 'active' LIMIT 1`);
  if (!local) return;
  saveApprovedSyncGroupMember({
    approvedByHostName: local.approved_by_host_name,
    authorizationId: local.authorization_id,
    groupId: local.group_id,
    hostName: current,
    hostPlatform: local.host_platform,
    now
  }, driver);
}

function transferHostState(driver: DatabaseDriver, previous: string, current: string) {
  mergeNodeReadingState(driver, previous, current);
  mergeNodeViewState(driver, previous, current);
  mergeSettingRecords(driver, previous, current);
}

function rehashPrivateObjects(driver: DatabaseDriver, hostName: string) {
  const settings = driver.queryAll<{
    form_factor: string; host_name: string; key: string; platform: string; scope: string; value_json: string;
  }>('SELECT key, scope, platform, form_factor, host_name, value_json FROM setting_records');
  for (const row of settings) {
    const hash = computeSyncContentHash('setting', row);
    const objectId = `${row.scope}:${row.platform}:${row.form_factor}:${row.host_name}:${row.key}`;
    driver.execute('UPDATE setting_records SET content_hash = ? WHERE key = ? AND scope = ? AND platform = ? AND form_factor = ? AND host_name = ?',
      [hash, row.key, row.scope, row.platform, row.form_factor, row.host_name]);
    driver.execute("UPDATE sync_object_state SET content_hash = ?, sync_dirty = 1 WHERE object_type = 'setting' AND object_id = ?",
      [hash, objectId]);
  }
  const views = driver.queryAll<{
    node_id: string; scroll_top: number; selection_from: number | null; selection_to: number | null; source: string;
  }>('SELECT node_id, scroll_top, selection_from, selection_to, source FROM node_view_state WHERE host_name = ?', [hostName]);
  for (const row of views) {
    const objectId = `session_resume:windows:desktop:${hostName}:node:${row.node_id}`;
    const hash = computeSyncContentHash('view_state', withoutNodeViewStateHashSource({
      host_name: hostName, form_factor: 'desktop', key: `node:${row.node_id}`,
      platform: 'windows', scope: 'session_resume', ...row
    }));
    driver.execute("UPDATE sync_object_state SET content_hash = ?, sync_dirty = 1 WHERE object_type = 'view_state' AND object_id = ?",
      [hash, objectId]);
  }
  rehashActiveNode(driver, hostName);
}

function rehashActiveNode(driver: DatabaseDriver, hostName: string) {
  const objectId = `session_resume:windows:desktop:${hostName}:active_node`;
  const row = driver.queryOne<{ value: string }>("SELECT value FROM workspace_meta WHERE key = 'active_node_id'");
  const hash = computeSyncContentHash('view_state', {
    active_node_id: row?.value ?? null, form_factor: 'desktop', host_name: hostName,
    key: 'active_node', platform: 'windows', scope: 'session_resume'
  });
  driver.execute("UPDATE sync_object_state SET content_hash = ?, sync_dirty = 1 WHERE object_type = 'view_state' AND object_id = ?",
    [hash, objectId]);
}

function mergeNodeReadingState(driver: DatabaseDriver, previous: string, current: string) {
  driver.execute(`INSERT INTO node_reading_host_state (node_id, host_name, reading_position, updated_at)
    SELECT node_id, ?, reading_position, updated_at FROM node_reading_host_state WHERE host_name = ?
    ON CONFLICT(node_id, host_name) DO UPDATE SET reading_position = excluded.reading_position,
      updated_at = excluded.updated_at`, [current, previous]);
}

function mergeNodeViewState(driver: DatabaseDriver, previous: string, current: string) {
  driver.execute(`INSERT INTO node_view_state
    (node_id, host_name, scroll_top, selection_from, selection_to, source, updated_at)
    SELECT node_id, ?, scroll_top, selection_from, selection_to, source, updated_at
    FROM node_view_state WHERE host_name = ?
    ON CONFLICT(node_id, host_name) DO UPDATE SET scroll_top = excluded.scroll_top,
      selection_from = excluded.selection_from, selection_to = excluded.selection_to,
      source = excluded.source, updated_at = excluded.updated_at`, [current, previous]);
}

function mergeSettingRecords(driver: DatabaseDriver, previous: string, current: string) {
  driver.execute(`INSERT INTO setting_records
    (key, scope, platform, form_factor, host_name, value_json, content_hash, updated_at, deleted_at)
    SELECT key, scope, platform, form_factor, ?, value_json, content_hash, updated_at, deleted_at
    FROM setting_records WHERE host_name = ? AND scope <> 'user_space'
    ON CONFLICT(key, scope, platform, form_factor, host_name) DO UPDATE SET
      value_json = excluded.value_json, content_hash = excluded.content_hash,
      updated_at = excluded.updated_at, deleted_at = excluded.deleted_at`, [current, previous]);
}

function rewritePrivateObjectIds(driver: DatabaseDriver, previous: string, current: string) {
  const rows = driver.queryAll<{ object_id: string; object_type: string }>(
    "SELECT object_id, object_type FROM sync_object_state WHERE object_type IN ('setting', 'view_state')"
  );
  for (const row of rows) {
    const next = replaceScope(row.object_id, previous, current);
    if (next === row.object_id) continue;
    driver.execute('DELETE FROM sync_object_state WHERE object_type = ? AND object_id = ?', [row.object_type, next]);
    driver.execute('UPDATE sync_object_state SET object_id = ?, sync_dirty = 1 WHERE object_type = ? AND object_id = ?',
      [next, row.object_type, row.object_id]);
  }
}

function replaceScope(objectId: string, previous: string, current: string) {
  const parts = objectId.split(':');
  if (parts.length < 5 || parts[3] !== previous || parts[0] === 'user_space') return objectId;
  parts[3] = current;
  if (parts[0] === 'device') parts[0] = 'host';
  return parts.join(':');
}

function pruneOtherHosts(driver: DatabaseDriver, current: string) {
  driver.execute('DELETE FROM node_reading_host_state WHERE host_name <> ?', [current]);
  driver.execute('DELETE FROM node_view_state WHERE host_name <> ?', [current]);
  driver.execute("DELETE FROM setting_records WHERE scope <> 'user_space' AND host_name <> ?", [current]);
}

function pruneOtherHostObjectState(driver: DatabaseDriver, current: string) {
  const rows = driver.queryAll<{ object_id: string; object_type: string }>(
    "SELECT object_id, object_type FROM sync_object_state WHERE object_type IN ('setting', 'view_state')"
  );
  for (const row of rows) {
    const parts = row.object_id.split(':');
    const isSharedSetting = row.object_type === 'setting' && parts[0] === 'user_space';
    if (isSharedSetting || parts.length >= 5 && parts[3] === current) continue;
    driver.execute('DELETE FROM sync_object_state WHERE object_type = ? AND object_id = ?',
      [row.object_type, row.object_id]);
  }
}

function ensureLegacyIdentity(driver: DatabaseDriver, fallback: string, now: string) {
  if (readLegacyName(driver)) return;
  writeSetting(driver, 'device_id', fallback, now);
}

function readLegacyName(driver: DatabaseDriver) {
  for (const key of LEGACY_DEVICE_KEYS) {
    const value = readSetting(driver, key);
    if (value) return value;
  }
  return null;
}

function writeSetting(driver: DatabaseDriver, key: string, value: string, now: string) {
  driver.execute(`INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  [key, JSON.stringify(value), now]);
}

function readSetting(driver: DatabaseDriver, key: string) {
  const value = driver.queryOne<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key])?.value;
  if (!value) return null;
  try { return normalize(JSON.parse(value)); } catch { return normalize(value); }
}

function normalize(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
