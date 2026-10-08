import {
  assertSystemEntryDisplayNamesSettingIdentity,
  assertSystemEntryDisplayNamesSettingPayload
} from '../../platform/systemEntryDisplayNameContract.js';
import { resolveSettingDataPolicy } from '../database/settingDataPolicy.js';

import { hasCanonicalPrivateStateContentHash } from './canonicalPrivateStateContentHash.js';
import type { DbPort } from './dbPort.js';
import type { SyncObjectPayloadApplyOptions } from './syncObjectLearningPayloadExecutor.js';
import { asObject, integer, numberOrNull, text } from './syncObjectPayloadValues.js';
import type { SyncPackSyncObjectRecord } from './syncPackSyncObjectsExecutor.js';

export async function applySettingObject(
  port: DbPort,
  record: SyncPackSyncObjectRecord,
  options: SyncObjectPayloadApplyOptions
) {
  assertCanonicalHash(record);
  const parts = record.object_id.split(':', 5);
  if (parts.length !== 5 || parts.some((part) => !part)) throw new Error('invalid_setting_host_scope');
  const [scope, platform, formFactor, hostName, key] = parts as [string, string, string, string, string];
  const isDisplayNames = assertSystemEntryDisplayNamesSettingIdentity(record.object_id);
  if (scope === 'user_space' && resolveSettingDataPolicy(key).ownership !== 'workspace') return false;
  if (scope !== 'user_space' && (!options.hostName || hostName !== options.hostName)) return false;
  if (record.deleted_at) {
    await port.run(
      `DELETE FROM setting_records WHERE scope = ? AND platform = ? AND form_factor = ? AND host_name = ? AND key = ?`,
      [scope, platform, formFactor, hostName, key]
    );
    return true;
  }
  const payload = asObject(record);
  if (isDisplayNames) assertSystemEntryDisplayNamesSettingPayload(record.object_id, payload);
  await port.run(
    `INSERT INTO setting_records (scope, platform, form_factor, host_name, key, value_json, content_hash, updated_at, deleted_at) ` +
    `VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ` +
    `ON CONFLICT(key, scope, platform, form_factor, host_name) DO UPDATE SET ` +
    `value_json = excluded.value_json, content_hash = excluded.content_hash, updated_at = excluded.updated_at, deleted_at = excluded.deleted_at`,
    [text(payload.scope) ?? scope, text(payload.platform) ?? platform,
      text(payload.form_factor) ?? formFactor, text(payload.host_name) ?? hostName,
      text(payload.key) ?? key, text(payload.value_json) ?? 'null',
      record.content_hash, record.updated_at, null]
  );
  return true;
}

export async function applyViewStateObject(
  port: DbPort,
  record: SyncPackSyncObjectRecord,
  options: SyncObjectPayloadApplyOptions
) {
  assertCanonicalHash(record);
  if (!isLocalAndroidViewStateObject(record.object_id, options.hostName)) return false;
  const parts = record.object_id.split(':');
  if (parts.length < 5 || !parts[3]) throw new Error('invalid_view_state_host_scope');
  const hostName = parts[3];
  const key = parts.slice(4).join(':');
  if (record.deleted_at) {
    if (key === 'active_node') await port.run("DELETE FROM workspace_meta WHERE key = 'active_node_id'");
    if (key.startsWith('node:')) await port.run(
      'DELETE FROM node_view_state WHERE node_id = ? AND host_name = ?', [key.slice(5), hostName]);
    return true;
  }
  const payload = asObject(record);
  if (key === 'active_node') {
    await applyActiveNodeViewStateObject(port, record, text(payload.active_node_id));
  } else if (key.startsWith('node:')) {
    await port.run(
      `INSERT INTO node_view_state (node_id, host_name, scroll_top, selection_from, selection_to, source, updated_at) ` +
      `VALUES (?, ?, ?, ?, ?, 'sync-apply', ?) ON CONFLICT(node_id, host_name) DO UPDATE SET ` +
      `scroll_top = excluded.scroll_top, selection_from = excluded.selection_from, ` +
      `selection_to = excluded.selection_to, source = excluded.source, updated_at = excluded.updated_at`,
      [key.slice(5), hostName, Math.max(0, integer(payload.scroll_top)),
        numberOrNull(payload.selection_from), numberOrNull(payload.selection_to), record.updated_at]
    );
  }
  return true;
}

function assertCanonicalHash(record: SyncPackSyncObjectRecord) {
  if (!hasCanonicalPrivateStateContentHash(record)) {
    throw new Error(`sync_content_hash_mismatch:${record.object_type}`);
  }
}

async function applyActiveNodeViewStateObject(
  port: DbPort,
  record: SyncPackSyncObjectRecord,
  activeNodeId: string | null
) {
  if (!activeNodeId) {
    await port.run("DELETE FROM workspace_meta WHERE key = 'active_node_id'");
    return;
  }
  const [node] = await port.query<{ id: string }>(
    'SELECT id FROM nodes WHERE id = ? AND deleted_at IS NULL', [activeNodeId]
  );
  if (!node) return;
  await port.run(
    `INSERT INTO workspace_meta (key, value, updated_at) VALUES ('active_node_id', ?, ?) ` +
    `ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [activeNodeId, record.updated_at]
  );
}

function isLocalAndroidViewStateObject(objectId: string, hostName?: string) {
  if (!hostName) return false;
  const parts = objectId.split(':');
  return parts.length >= 5 && parts[1] === 'android' && parts[3] === hostName;
}
