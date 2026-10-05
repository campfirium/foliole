import type { PluginListenerHandle } from '@capacitor/core';

import type { DbPort, DbRow } from '../../../../../lib/core/sync/dbPort';
import { assertSyncGroupJoinMergeAllowed } from '../../../../../lib/core/sync/syncGroupJoinMergeGuard';
import {
  COMPANION_SYNC_GROUP_DATA_CONTRACT as CONTRACT,
  type CompanionSyncGroupDataRequest
} from '../../../../../lib/platform/companionSyncGroupDataContract';
import { parseSyncGroupMemberState } from '../../../../../lib/platform/syncGroupMemberStateContract';
import { createSyncGroupDeviceIdentity } from '../../../../../lib/platform/syncGroupUnifiedContract';
import { runCompanionSyncWriterTask } from '../../companionSyncWriterQueue';
import { FolioleCompanionSync } from '../../companionWorkspaceRuntimeRepository';
import { handleCompanionAttachmentCheckpoint } from '../runtime/companionAttachmentCheckpoint';
import { getIosCompanionDatabaseOwner } from '../runtime/iosCompanionDatabaseBootstrap';

import * as framedSyncData from './framed/companionFramedSyncDataOperation';
import { applyCompanionSyncIdentityPackWithDbPort } from './pack-apply/companionSyncIdentityPackApply';
import { prepareCompanionSyncIdentityPack } from './syncGroupIdentityPackPrepare';
import { readCompanionSyncIdentitySource } from './syncGroupIdentitySourceRead';
import {
  applyCompanionSyncGroupMemberState,
  loadCompanionSyncGroupMemberState
} from './syncGroupMemberStateStore';
import { loadCurrentCredential, loadGroupPayload } from './syncGroupProviderCredentialStore';
import { createCompanionSyncGroupSourceSnapshot } from './syncGroupSourceSnapshot';
import { confirmVersionPack, stageVersionPack } from './syncGroupVersionPackDataOwner';

let listenerReady: Promise<void> | null = null;

function dataPlugin() {
  return FolioleCompanionSync as typeof FolioleCompanionSync & {
    addListener(eventName: 'syncGroupDataRequest', listener: (event: CompanionSyncGroupDataRequest) => void):
      Promise<PluginListenerHandle>;
  };
}

export function ensureCompanionSyncGroupDataOwner() {
  listenerReady ??= dataPlugin().addListener(CONTRACT.eventName, (request) => {
    void handleRequest(request);
  }).then(() => undefined);
  return listenerReady;
}

async function handleRequest(request: CompanionSyncGroupDataRequest) {
  try {
    const result = await dispatch(request.operation, request.payload);
    await dataPlugin().resolveSyncGroupDataRequest({
      request_id: request.request_id, result: { ...result }
    });
  } catch (error) {
    await dataPlugin().resolveSyncGroupDataRequest({
      error: error instanceof Error ? error.message : String(error), request_id: request.request_id
    });
  }
}

function dispatch(operation: string, payload: Record<string, unknown>) {
  if (operation === CONTRACT.operations.validateJoin) return getIosCompanionDatabaseOwner().read(async (db) => {
    await assertSyncGroupJoinMergeAllowed(db, payload);
    return { allowed: true };
  });
  if (operation === CONTRACT.operations.attachmentCheckpoint) return handleCompanionAttachmentCheckpoint(getIosCompanionDatabaseOwner(), payload);
  if (operation === CONTRACT.operations.createSnapshot) return createCompanionSyncGroupSourceSnapshot(payload);
  if (operation === CONTRACT.operations.readIdentitySource) return getIosCompanionDatabaseOwner()
    .read((db) => readCompanionSyncIdentitySource(db, payload));
  if (operation === CONTRACT.operations.prepareIdentityPack) return getIosCompanionDatabaseOwner()
    .read((db) => prepareCompanionSyncIdentityPack(db, payload));
  if (operation === CONTRACT.operations.applyIdentityPack) return writer(async (db) => {
    const sourcePeerId = requiredText(payload.authenticated_device_id);
    const targetPeerId = requiredText(payload.local_device_id);
    const result = await applyCompanionSyncIdentityPackWithDbPort(db, {
      hostName: requiredText(payload.host_name), manifest: payload.manifest,
      packPath: requiredText(payload.pack_path), sourcePeerId, targetPeerId
    });
    const page = requiredObject(requiredObject(payload.manifest).identity_page);
    return { applied: result.applied, pageId: requiredText(page.page_id) };
  });
  if (operation === CONTRACT.operations.applyFramedTransfer)
    return writer((db) => framedSyncData.applyCompanionFramedSyncDataOperation(db, payload));
  if (operation === CONTRACT.operations.readFramedInventory)
    return getIosCompanionDatabaseOwner().read(framedSyncData.readCompanionFramedSyncInventory);
  if (operation === CONTRACT.operations.applyMemberState) {
    return applyCompanionSyncGroupMemberState(
      parseSyncGroupMemberState(payload.state),
      requiredText(payload.authenticated_device_id)
    );
  }
  if (operation === CONTRACT.operations.loadCurrentCredential) return loadCurrentCredential(payload);
  if (operation === CONTRACT.operations.loadGroup) return loadGroupPayload();
  if (operation === CONTRACT.operations.loadMemberState) return loadCompanionSyncGroupMemberState();
  if (operation === CONTRACT.operations.registerDevice) return registerDevice(payload);
  if (operation === CONTRACT.operations.verifyDevice) return verifyDevice(payload);
  if (operation === CONTRACT.operations.recordSupplyCursor) return recordSupplyCursor(payload);
  if (operation === CONTRACT.operations.saveSyncEndpoint) return saveSyncEndpoint(payload);
  if (operation === CONTRACT.operations.stageVersionPack) return stageVersionPack(payload);
  if (operation === CONTRACT.operations.confirmVersionPack) return confirmVersionPack(payload);
  throw new Error('sync_group_data_operation_unsupported');
}

async function registerDevice(payload: Record<string, unknown>) {
  const groupId = requiredText(payload.group_id);
  const device = requiredObject(payload.device);
  const identity = createSyncGroupDeviceIdentity({
    device_anchor: requiredText(device.device_anchor), group_id: groupId,
    library_path: requiredText(device.canonical_library_path),
    path_flavor: device.path_flavor === 'windows' ? 'windows' : 'posix'
  });
  if (identity.identity_key !== requiredText(device.device_identity_key)) {
    throw new Error('sync_group_device_identity_mismatch');
  }
  const now = new Date().toISOString();
  return writer(async (db) => {
    await db.run(`UPDATE sync_group_removal_decisions SET superseded_at = ?
      WHERE group_id = ? AND target_device_identity_key = ? AND superseded_at IS NULL`,
    [now, groupId, identity.identity_key]);
    await db.run(
      `INSERT INTO sync_group_devices (
        group_id, device_identity_key, device_anchor, canonical_library_path, device_name,
        platform, state, joined_at, left_at, last_seen_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, NULL, ?, ?)
      ON CONFLICT(group_id, device_identity_key) DO UPDATE SET
        device_name = excluded.device_name, platform = excluded.platform, state = 'active',
        left_at = NULL, last_seen_at = excluded.last_seen_at, updated_at = excluded.updated_at`,
      [groupId, identity.identity_key, identity.device_anchor, identity.canonical_library_path,
        requiredText(device.device_name), requiredText(device.platform), now, now, now]
    );
    return { device_id: identity.identity_key, registered: true };
  });
}

async function verifyDevice(payload: Record<string, unknown>) {
  const groupId = requiredText(payload.group_id);
  const deviceId = requiredText(payload.device_id);
  return getIosCompanionDatabaseOwner().read(async (db) => {
    const row = (await db.query<DbRow>(
      `SELECT d.device_name FROM sync_group_devices d
       WHERE d.group_id = ? AND d.device_identity_key = ? AND d.state = 'active'
         AND NOT EXISTS (
           SELECT 1 FROM sync_group_removal_decisions r
           WHERE r.group_id = d.group_id AND r.target_device_identity_key = d.device_identity_key
             AND r.superseded_at IS NULL
         ) LIMIT 1`,
      [groupId, deviceId]
    ))[0];
    return { active: Boolean(row), ...(row ? { device_name: requiredText(row.device_name) } : {}) };
  });
}

function recordSupplyCursor(payload: Record<string, unknown>) {
  return writer(async (db) => {
    await db.run(
      `INSERT OR REPLACE INTO sync_peer_cursors
       (peer_id, stream_name, cursor_value, updated_at) VALUES (?, 'sync-pack-supply', ?, ?)`,
      [requiredText(payload.peer_id), `${requiredNumber(payload.from_cursor)}:${requiredNumber(payload.to_cursor)}`,
        new Date().toISOString()]
    );
    return { recorded: true };
  });
}

function saveSyncEndpoint(payload: Record<string, unknown>) {
  return writer(async (db) => {
    await db.run(
      `INSERT OR REPLACE INTO companion_meta (key, value, updated_at)
       VALUES ('workspace_sync_endpoint_url', ?, ?)`,
      [requiredText(payload.endpoint_url), requiredText(payload.updated_at)]
    );
    return { saved: true };
  });
}

function writer<T>(task: (db: DbPort) => Promise<T>) {
  return runCompanionSyncWriterTask(() => getIosCompanionDatabaseOwner().runWriter(task));
}

function requiredText(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('sync_group_data_text_required');
  return value.trim();
}

function requiredNumber(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('sync_group_data_number_required');
  return value;
}

function requiredObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('sync_group_data_object_required');
  return value as Record<string, unknown>;
}
