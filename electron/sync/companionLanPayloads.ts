import os from 'node:os';

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

function resolveDesktopDeviceName() {
  const hostName = os.hostname().trim();
  return hostName ? `Foliole Desktop on ${hostName}` : 'Foliole Desktop';
}

export function buildDiscoveryPayload(appVersion: string, peerId: string) {
  const hostName = os.hostname().trim();
  return {
    app_version: appVersion,
    desktop_device_name: resolveDesktopDeviceName(),
    desktop_name: 'Foliole Desktop',
    desktop_platform: resolveDesktopPlatformLabel(),
    host_name: hostName || 'Desktop',
    pairing_mode: 'desktop-confirm' as const,
    peer_id: peerId
  };
}
