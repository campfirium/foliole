import os from 'node:os';

import { CURRENT_SYNC_PROTOCOL_DESCRIPTOR } from '../../lib/platform/syncProtocolContract.js';
import { loadDesktopSyncGroup } from '../database/syncGroupStore.js';
import type { WorkspaceSnapshot, WorkspaceVersionMetadata } from '../database/workspaceSnapshot.js';

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

export function resolveDesktopDeviceName() {
  return normalizeDesktopHostName(os.hostname());
}

export function normalizeDesktopHostName(value: string) {
  const hostName = value.trim().replace(/\.local$/iu, '');
  return hostName || 'Foliole Desktop';
}

export function buildDiscoveryPayload(appVersion: string, peerId: string) {
  const group = loadDesktopSyncGroup();
  if (!group || group.local_member_state !== 'active') return null;
  return {
    app_version: appVersion,
    desktop_device_name: resolveDesktopDeviceName(),
    desktop_name: 'Foliole Desktop',
    desktop_platform: resolveDesktopPlatformLabel(),
    pairing_mode: 'desktop-confirm' as const,
    peer_id: peerId,
    group_display_name: group.display_name,
    group_id: group.group_id,
    timeline_id: group.timeline_id,
    protocol: CURRENT_SYNC_PROTOCOL_DESCRIPTOR
  };
}
