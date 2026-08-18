import type { NativeReadwiseDeviceAssignment } from '../../lib/platform/nativeReadwiseDeviceContract.js';

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

export function loadReadwiseDeviceAssignment(): NativeReadwiseDeviceAssignment {
  const currentDeviceId = loadOrCreateDesktopDeviceId();
  const activeDeviceId = readActiveDeviceId();
  return {
    active_device_id: activeDeviceId,
    active_device_name: activeDeviceId ? deviceName(activeDeviceId) : null,
    current_device_id: currentDeviceId,
    current_device_name: deviceName(currentDeviceId),
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
