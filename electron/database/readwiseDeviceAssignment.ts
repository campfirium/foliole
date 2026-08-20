import type { DatabaseRow } from '../../lib/core/database/driver.js';
import type {
  NativeReadwiseDeviceAssignment,
  NativeReadwiseWorkgroupDevice
} from '../../lib/platform/nativeReadwiseDeviceContract.js';
import { loadOrCreateDesktopInstallationIdentity } from '../desktopInstallationIdentity.js';

import { openDatabaseConnection } from './connection.js';
import { loadOrCreateDesktopDeviceId } from './deviceIdentity.js';
import { loadJsonSetting, saveJsonSetting } from './settingsStore.js';

const READWISE_ACTIVE_DEVICE_KEY = 'readwise_active_device';

function readActiveDeviceId() {
  const value = loadJsonSetting(READWISE_ACTIVE_DEVICE_KEY);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const deviceId = (value as Record<string, unknown>).device_id;
  return typeof deviceId === 'string' && deviceId.trim() ? deviceId.trim() : null;
}

function deviceDetails(deviceId: string): NativeReadwiseWorkgroupDevice {
  return openDatabaseConnection().driver.queryOne<NativeReadwiseWorkgroupDevice & DatabaseRow>(
    `SELECT host_name AS device_id, host_name AS device_name, host_platform AS platform
     FROM sync_group_members WHERE host_name = ? ORDER BY updated_at DESC LIMIT 1`, [deviceId]
  ) ?? { device_id: deviceId, device_name: deviceId, platform: null };
}

function currentHostId() {
  return openDatabaseConnection().driver.queryOne<{ host_name: string }>(
    `SELECT l.local_host_name AS host_name FROM sync_group_local_state l
     JOIN sync_group_members m ON m.group_id = l.group_id AND m.host_name = l.local_host_name
     WHERE l.singleton_id = 1 AND l.member_state = 'active' AND m.state = 'active' LIMIT 1`
  )?.host_name ?? loadOrCreateDesktopDeviceId();
}

function readWorkgroupDesktopDevices(currentDeviceId: string, activeDeviceId: string | null) {
  const devices = openDatabaseConnection().driver.queryAll<NativeReadwiseWorkgroupDevice & DatabaseRow>(
    `SELECT m.host_name AS device_id, m.host_name AS device_name, m.host_platform AS platform
     FROM sync_group_local_state l
     JOIN sync_group_members m ON m.group_id = l.group_id
     WHERE l.singleton_id = 1 AND m.state = 'active' AND m.host_platform IN ('darwin', 'win32')
     ORDER BY m.host_name`
  );
  const byId = new Map<string, NativeReadwiseWorkgroupDevice>(
    devices.map((device) => [device.device_id, device])
  );
  for (const deviceId of [currentDeviceId, activeDeviceId]) {
    if (deviceId && !byId.has(deviceId)) {
      byId.set(deviceId, deviceDetails(deviceId));
    }
  }
  return [...byId.values()];
}

export function loadReadwiseDeviceAssignment(): NativeReadwiseDeviceAssignment {
  const currentDeviceId = currentHostId();
  const activeDeviceId = readActiveDeviceId();
  return {
    active_device_id: activeDeviceId,
    active_device_name: activeDeviceId ? deviceDetails(activeDeviceId).device_name : null,
    current_device_id: currentDeviceId,
    current_device_name: deviceDetails(currentDeviceId).device_name,
    devices: readWorkgroupDesktopDevices(currentDeviceId, activeDeviceId),
    is_active: activeDeviceId === null || activeDeviceId === currentDeviceId,
    legacy_unassigned: activeDeviceId === null
  };
}

export function activateReadwiseOnThisDevice() {
  const currentDeviceId = currentHostId();
  saveJsonSetting(READWISE_ACTIVE_DEVICE_KEY, { device_id: currentDeviceId });
  return loadReadwiseDeviceAssignment();
}

export function canCurrentDeviceRunReadwise() {
  if (!loadReadwiseDeviceAssignment().is_active) return false;
  const installationId = loadOrCreateDesktopInstallationIdentity().installationId;
  const sources = openDatabaseConnection().driver.queryAll<{ owner_installation_id: string | null }>(
    "SELECT owner_installation_id FROM desktop_sources WHERE source_type = 'readwise'"
  );
  return sources.length > 0 && sources.every((source) => source.owner_installation_id === installationId);
}
