import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { app, safeStorage } from 'electron';

const PAIRED_DEVICE_STORE_FILE = 'companion-paired-devices.bin';

export interface PairedCompanionDevice {
  device_id: string;
  device_kind: string;
  device_name: string;
  device_secret: string;
  paired_at: string;
}

interface PairedDeviceStorePayload {
  devices: PairedCompanionDevice[];
}

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
  if (!fs.existsSync(storePath)) {
    return { devices: [] };
  }
  ensureEncryptionAvailable();
  const encrypted = fs.readFileSync(storePath);
  const decrypted = safeStorage.decryptString(encrypted);
  const parsed = JSON.parse(decrypted) as Partial<PairedDeviceStorePayload>;
  return {
    devices: Array.isArray(parsed.devices) ? parsed.devices.filter(isPairedDeviceRecord) : []
  };
}

function writeStore(payload: PairedDeviceStorePayload) {
  ensureEncryptionAvailable();
  fs.mkdirSync(path.dirname(resolveStorePath()), { recursive: true });
  const encrypted = safeStorage.encryptString(JSON.stringify(payload));
  fs.writeFileSync(resolveStorePath(), encrypted);
}

function isPairedDeviceRecord(value: unknown): value is PairedCompanionDevice {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
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

export function loadPairedCompanionDevice(deviceId: string) {
  const normalizedDeviceId = deviceId.trim();
  if (!normalizedDeviceId) {
    return null;
  }
  return readStore().devices.find((device) => device.device_id === normalizedDeviceId) ?? null;
}

export function registerPairedCompanionDevice(args: {
  deviceId: string;
  deviceKind: string;
  deviceName: string;
  pairedAt?: string;
}) {
  const now = args.pairedAt ?? new Date().toISOString();
  const next: PairedCompanionDevice = {
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
