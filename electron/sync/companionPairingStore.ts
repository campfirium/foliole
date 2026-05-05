import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { app, safeStorage } from 'electron';

const PAIRED_DEVICE_STORE_FILE = 'companion-paired-devices.bin';

export interface PairedCompanionDevice {
  client_address: string | null;
  device_id: string;
  device_kind: string;
  device_name: string;
  device_secret: string;
  paired_at: string;
}

interface PairedDeviceStorePayload {
  devices: PairedCompanionDevice[];
}

let cachedStore: PairedDeviceStorePayload | null = null;
let cachedStorePath: string | null = null;

function resolveStorePath() {
  return path.join(app.getPath('userData'), PAIRED_DEVICE_STORE_FILE);
}

function ensureEncryptionAvailable() {
  if (safeStorage.isEncryptionAvailable()) {
    return;
  }
  throw new Error('Electron safeStorage is unavailable for companion pairing secrets.');
}

function readStore(): PairedDeviceStorePayload {
  const storePath = resolveStorePath();
  if (cachedStore && cachedStorePath === storePath) {
    return cachedStore;
  }
  if (!fs.existsSync(storePath)) {
    cachedStorePath = storePath;
    cachedStore = { devices: [] };
    return cachedStore;
  }
  ensureEncryptionAvailable();
  const encrypted = fs.readFileSync(storePath);
  const decrypted = safeStorage.decryptString(encrypted);
  const parsed = JSON.parse(decrypted) as Partial<PairedDeviceStorePayload>;
  cachedStore = {
    devices: Array.isArray(parsed.devices) ? parsed.devices.filter(isPairedDeviceRecord) : []
  };
  cachedStorePath = storePath;
  return cachedStore;
}

function writeStore(payload: PairedDeviceStorePayload) {
  ensureEncryptionAvailable();
  fs.mkdirSync(path.dirname(resolveStorePath()), { recursive: true });
  const encrypted = safeStorage.encryptString(JSON.stringify(payload));
  fs.writeFileSync(resolveStorePath(), encrypted);
  cachedStore = {
    devices: payload.devices.map((device) => ({ ...device }))
  };
  cachedStorePath = resolveStorePath();
}

function isPairedDeviceRecord(value: unknown): value is PairedCompanionDevice {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    (record.client_address === null || typeof record.client_address === 'string' || typeof record.client_address === 'undefined') &&
    typeof record.device_id === 'string' &&
    typeof record.device_kind === 'string' &&
    typeof record.device_name === 'string' &&
    typeof record.device_secret === 'string' &&
    typeof record.paired_at === 'string'
  );
}

export function countPairedCompanionDevices() {
  return readStore().devices.length;
}

export function loadPairedCompanionDevices() {
  return readStore().devices.map((device) => ({
    client_address: device.client_address ?? null,
    device_id: device.device_id,
    device_kind: device.device_kind,
    device_name: device.device_name,
    paired_at: device.paired_at
  }));
}

export function loadPairedCompanionDevice(deviceId: string) {
  const normalizedDeviceId = deviceId.trim();
  if (!normalizedDeviceId) {
    return null;
  }
  return readStore().devices.find((device) => device.device_id === normalizedDeviceId) ?? null;
}

export function removePairedCompanionDevice(deviceId: string) {
  const normalizedDeviceId = deviceId.trim();
  if (!normalizedDeviceId) {
    return false;
  }
  const store = readStore();
  const nextDevices = store.devices.filter((device) => device.device_id !== normalizedDeviceId);
  if (nextDevices.length === store.devices.length) {
    return false;
  }
  writeStore({ devices: nextDevices });
  return true;
}

export function registerPairedCompanionDevice(args: {
  clientAddress?: string | null;
  deviceId: string;
  deviceKind: string;
  deviceName: string;
  pairedAt?: string;
}) {
  const now = args.pairedAt ?? new Date().toISOString();
  const next: PairedCompanionDevice = {
    client_address: args.clientAddress?.trim() || null,
    device_id: args.deviceId.trim(),
    device_kind: args.deviceKind.trim(),
    device_name: args.deviceName.trim(),
    device_secret: randomBytes(32).toString('base64url'),
    paired_at: now
  };
  const store = readStore();
  store.devices = store.devices.filter((device) => device.device_id !== next.device_id);
  store.devices.push(next);
  writeStore(store);
  return next;
}

export function clearPairedCompanionDevices() {
  writeStore({ devices: [] });
}
