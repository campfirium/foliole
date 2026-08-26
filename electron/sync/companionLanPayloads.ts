import os from 'node:os';

import { resolveLocalSyncGroupDevice } from '../../lib/platform/syncGroupContract.js';
import { CURRENT_SYNC_PROTOCOL_DESCRIPTOR } from '../../lib/platform/syncProtocolContract.js';
import { loadDesktopSyncGroup } from '../database/syncGroupStore.js';
import type { WorkspaceSnapshot, WorkspaceVersionMetadata } from '../database/workspaceSnapshot.js';

import { loadSyncGroupRuntimeInstanceId } from './syncGroupRuntimeInstance.js';
import { loadDesktopWorkgroupKey } from './workgroupKeyStore.js';

export function buildWorkspaceSnapshotPayload(appVersion: string, peerId: string, snapshot: WorkspaceSnapshot | null) {
  return {
    app_version: appVersion,
    desktop_name: 'Foliole Desktop',
    exported_at: new Date().toISOString(),
    peer_id: peerId,
    workspace_version: new Date().toISOString(),
    workspace_snapshot: snapshot
  };
}

export function buildWorkspaceVersionPayload(appVersion: string, peerId: string, version: WorkspaceVersionMetadata) {
  return {
    app_version: appVersion,
    desktop_name: 'Foliole Desktop',
    exported_at: new Date().toISOString(),
    has_snapshot: version.hasSnapshot,
    peer_id: peerId,
    workspace_version: version.workspaceVersion
  };
}

function resolveDesktopPlatformLabel() {
  const platform = os.platform();
  if (platform === 'win32') return 'Windows';
  if (platform === 'darwin') return 'macOS';
  if (platform === 'linux') return 'Linux';
  return platform;
}

export function resolveDesktopHostName() {
  return normalizeDesktopHostName(os.hostname());
}

export function normalizeDesktopHostName(value: string) {
  const hostName = value.trim().replace(/\.local$/iu, '');
  return hostName || 'Foliole Desktop';
}

export function buildDiscoveryPayload(appVersion: string) {
  const group = loadDesktopSyncGroup();
  if (!group) return null;
  const workgroup = loadDesktopWorkgroupKey(group.group_id);
  if (!workgroup) return null;
  const local = resolveLocalSyncGroupDevice(group);
  if (!local) throw new Error('sync_group_local_device_missing');
  return {
    app_version: appVersion,
    runtime_instance_id: loadSyncGroupRuntimeInstanceId(),
    group_display_name: group.display_name,
    group_id: group.group_id,
    group_tag: workgroup.group_tag,
    protocol: CURRENT_SYNC_PROTOCOL_DESCRIPTOR,
    provider_device_id: local.device_identity_key,
    provider_device_name: local.device_name,
    provider_platform: resolveDesktopPlatformLabel()
  };
}
