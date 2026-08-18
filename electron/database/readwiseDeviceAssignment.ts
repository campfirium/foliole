import type { DatabaseRow } from '../../lib/core/database/driver.js';
import type {
  NativeReadwiseDeviceAssignment,
  NativeReadwiseWorkgroupDevice
} from '../../lib/platform/nativeReadwiseDeviceContract.js';

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

function deviceName(deviceId: string) {
  return openDatabaseConnection().driver.queryOne<{ device_name: string }>(
    `SELECT device_name FROM sync_group_members WHERE device_id = ? ORDER BY updated_at DESC LIMIT 1`, [deviceId]
  )?.device_name ?? deviceId;
}

function readWorkgroupDesktopDevices(currentDeviceId: string, activeDeviceId: string | null) {
  const devices = openDatabaseConnection().driver.queryAll<NativeReadwiseWorkgroupDevice & DatabaseRow>(
    `SELECT m.device_id, m.device_name FROM sync_group_local_state l
     JOIN sync_group_members m ON m.group_id = l.group_id
     WHERE l.singleton_id = 1 AND m.state = 'active' AND m.device_kind IN ('darwin', 'win32')
     ORDER BY m.device_name, m.device_id`
  );
  const byId = new Map(devices.map((device) => [device.device_id, device]));
  for (const deviceId of [currentDeviceId, activeDeviceId]) {
    if (deviceId && !byId.has(deviceId)) {
      byId.set(deviceId, { device_id: deviceId, device_name: deviceName(deviceId) });
    }
  }
  return [...byId.values()];
}

export function loadReadwiseDeviceAssignment(): NativeReadwiseDeviceAssignment {
  const currentDeviceId = loadOrCreateDesktopDeviceId();
  const activeDeviceId = readActiveDeviceId();
  return {
    active_device_id: activeDeviceId,
    active_device_name: activeDeviceId ? deviceName(activeDeviceId) : null,
    current_device_id: currentDeviceId,
    current_device_name: deviceName(currentDeviceId),
    devices: readWorkgroupDesktopDevices(currentDeviceId, activeDeviceId),
    is_active: activeDeviceId === null || activeDeviceId === currentDeviceId,
    legacy_unassigned: activeDeviceId === null
  };
}

export function activateReadwiseOnThisDevice() {
  const currentDeviceId = loadOrCreateDesktopDeviceId();
  saveJsonSetting(READWISE_ACTIVE_DEVICE_KEY, { device_id: currentDeviceId });
  return loadReadwiseDeviceAssignment();
}

export function canCurrentDeviceRunReadwise() {
  return loadReadwiseDeviceAssignment().is_active;
}
