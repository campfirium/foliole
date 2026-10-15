import type { SyncGroupDevicePayload } from './syncGroupContract.js';
import type { SyncGroupRemovalDecisionPayload } from './syncGroupMemberStateContract.js';

export interface SyncGroupRemovingEntry {
  target: { device_identity_key: string; device_name: string };
  confirmed_devices: Array<{ device_identity_key: string; device_name: string }>;
}

export function remainingSyncGroupDevices(
  devices: SyncGroupDevicePayload[], removals: SyncGroupRemovalDecisionPayload[]
) {
  const targets = new Set(removals.filter(item => !item.superseded_at)
    .map(item => item.target_device_identity_key));
  return devices.filter(device => device.state === 'active' && !targets.has(device.device_identity_key));
}

export function eligibleSyncGroupRemovals(
  devices: SyncGroupDevicePayload[], removals: SyncGroupRemovalDecisionPayload[]
) {
  const remaining = remainingSyncGroupDevices(devices, removals);
  return removals.filter(removal => !removal.completed_at && !removal.superseded_at &&
    remaining.every(device => removal.confirmations.some(item => item.kind === 'enforced' &&
      item.confirming_device_identity_key === device.device_identity_key)));
}

export function syncGroupRemovingEntries(
  devices: SyncGroupDevicePayload[], removals: SyncGroupRemovalDecisionPayload[]
): SyncGroupRemovingEntry[] {
  const remaining = remainingSyncGroupDevices(devices, removals);
  const effective = removals.filter(item => !item.superseded_at);
  const targets = new Set(effective.filter(item => !item.completed_at).map(item => item.target_device_identity_key));
  return devices.filter(device => targets.has(device.device_identity_key) &&
    !effective.some(item => item.target_device_identity_key === device.device_identity_key && item.completed_at))
    .map(target => {
      const decisions = effective.filter(item => item.target_device_identity_key === target.device_identity_key);
      // Concurrent decisions keep their own evidence. Show one decision, never a union of confirmations.
      const decision = decisions[0];
      return {
        target: displayDevice(target, devices),
        confirmed_devices: remaining.filter(device => decision?.confirmations.some(item =>
          item.kind === 'enforced' && item.confirming_device_identity_key === device.device_identity_key))
          .map(device => displayDevice(device, devices))
      };
    });
}

function displayDevice(device: SyncGroupDevicePayload, devices: SyncGroupDevicePayload[]) {
  return { device_identity_key: device.device_identity_key,
    device_name: syncGroupDeviceDisplayName(device, devices) };
}

export function syncGroupDeviceDisplayName(device: SyncGroupDevicePayload, devices: SyncGroupDevicePayload[]) {
  const duplicate = devices.some(other => other.device_identity_key !== device.device_identity_key &&
    other.device_name === device.device_name);
  return duplicate ? `${device.device_name} (${shortDeviceIdentity(device.device_identity_key)})` : device.device_name;
}

export function parseSyncGroupRemovingEntries(value: unknown): SyncGroupRemovingEntry[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is SyncGroupRemovingEntry =>
    Boolean(entry && typeof entry === 'object' && validDisplayDevice(entry.target) &&
      Array.isArray(entry.confirmed_devices) && entry.confirmed_devices.every(validDisplayDevice)));
}

function validDisplayDevice(value: unknown): boolean {
  return Boolean(value && typeof value === 'object' &&
    'device_identity_key' in value && typeof value.device_identity_key === 'string' &&
    'device_name' in value && typeof value.device_name === 'string');
}

function shortDeviceIdentity(identity: string) {
  let hash = 2166136261;
  for (const character of identity) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(16).padStart(8, '0');
}
