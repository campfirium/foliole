import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { app, safeStorage } from 'electron';

import type { SyncProtocolDescriptor } from '../../lib/platform/syncProtocolContract.js';

const PAIRED_DEVICE_STORE_FILE = 'companion-paired-devices.bin';
const CORRUPT_STORE_SUFFIX = '.corrupt-';

export interface PairedCompanionDevice {
  client_address: string | null;
  device_id: string;
  device_kind: string;
  device_name: string;
  device_secret: string;
  negotiated_protocol_version?: number;
  paired_at: string;
  remote_protocol?: SyncProtocolDescriptor;
}

interface PairedDeviceStorePayload {
  devices: PairedCompanionDevice[];
}

let cachedStore: PairedDeviceStorePayload | null = null;
let cachedStorePath: string | null = null;

class PairedDeviceStoreUnreadableError extends Error {
  constructor(
    message: string,
    override readonly cause: unknown,
    readonly storePath: string
  ) {
    super(message);
    this.name = 'PairedDeviceStoreUnreadableError';
  }
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

function readStoreStrict(): PairedDeviceStorePayload {
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
  const parsed = readEncryptedStorePayload(encrypted, storePath);
  cachedStore = {
    devices: Array.isArray(parsed.devices) ? parsed.devices.filter(isPairedDeviceRecord) : []
  };
  cachedStorePath = storePath;
  return cachedStore;
}

function readStoreForQuery(): PairedDeviceStorePayload {
  try {
    return readStoreStrict();
  } catch (error) {
    if (!(error instanceof PairedDeviceStoreUnreadableError)) {
      throw error;
    }
    quarantineUnreadableStore(error.storePath, error.cause);
    return { devices: [] };
  }
}

function readEncryptedStorePayload(encrypted: Buffer, storePath: string): Partial<PairedDeviceStorePayload> {
  try {
    return JSON.parse(safeStorage.decryptString(encrypted)) as Partial<PairedDeviceStorePayload>;
  } catch (error) {
    cachedStore = null;
    cachedStorePath = null;
    throw new PairedDeviceStoreUnreadableError('Companion paired-device store is unreadable.', error, storePath);
  }
}

function quarantineUnreadableStore(storePath: string, cause: unknown) {
  const quarantinedPath = `${storePath}${CORRUPT_STORE_SUFFIX}${new Date().toISOString().replace(/[:.]/g, '-')}`;
  try {
    fs.renameSync(storePath, quarantinedPath);
    console.warn('[companion-sync] paired companion device cache is unreadable; quarantined stored pairings', {
      cause,
      quarantinedPath
    });
  } catch (error) {
    console.warn('[companion-sync] paired companion device cache is unreadable and could not be quarantined', {
      cause,
      error,
      storePath
    });
  }
}

function writeStore(payload: PairedDeviceStorePayload) {
  ensureEncryptionAvailable();
  fs.mkdirSync(path.dirname(resolveStorePath()), { recursive: true });
  const encrypted = safeStorage.encryptString(JSON.stringify({ devices: dedupePairedDevices(payload.devices) }));
  fs.writeFileSync(resolveStorePath(), encrypted);
  cachedStore = {
    devices: dedupePairedDevices(payload.devices)
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
  return dedupePairedDevices(readStoreForQuery().devices).length;
}

export function loadPairedCompanionDevices() {
  return dedupePairedDevices(readStoreForQuery().devices).map((device) => ({
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
  return readStoreForQuery().devices.find((device) => device.device_id === normalizedDeviceId) ?? null;
}

export function removePairedCompanionDevice(deviceId: string) {
  const normalizedDeviceId = deviceId.trim();
  if (!normalizedDeviceId) {
    return false;
  }
  const store = readStoreStrict();
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
  negotiatedProtocolVersion: number;
  pairedAt?: string;
  remoteProtocol: SyncProtocolDescriptor;
}) {
  const now = args.pairedAt ?? new Date().toISOString();
  const next: PairedCompanionDevice = {
    client_address: args.clientAddress?.trim() || null,
    device_id: args.deviceId.trim(),
    device_kind: args.deviceKind.trim(),
    device_name: args.deviceName.trim(),
    device_secret: randomBytes(32).toString('base64url'),
    negotiated_protocol_version: args.negotiatedProtocolVersion,
    paired_at: now,
    remote_protocol: args.remoteProtocol
  };
  const store = readStoreStrict();
  if (store.devices.some((device) => isSameLanLabel(device, next))) {
    console.warn('[companion-sync] paired companion device has matching LAN label with a different device id', {
      clientAddress: next.client_address,
      deviceKind: next.device_kind,
      deviceName: next.device_name
    });
  }
  store.devices = store.devices.filter((device) => !isSamePairedDevice(device, next));
  store.devices.push(next);
  writeStore(store);
  return next;
}

export function clearPairedCompanionDevices() {
  writeStore({ devices: [] });
}

function isSamePairedDevice(left: PairedCompanionDevice, right: PairedCompanionDevice) {
  return left.device_id === right.device_id;
}

function isSameLanLabel(left: PairedCompanionDevice, right: PairedCompanionDevice) {
  return Boolean(
    left.device_id !== right.device_id &&
    left.client_address &&
    right.client_address &&
    left.client_address === right.client_address &&
    left.device_kind === right.device_kind &&
    left.device_name === right.device_name
  );
}

function dedupePairedDevices(devices: PairedCompanionDevice[]) {
  const deduped: PairedCompanionDevice[] = [];
  for (const device of devices) {
    const existingIndex = deduped.findIndex((existing) => isSamePairedDevice(existing, device));
    if (existingIndex >= 0) {
      deduped.splice(existingIndex, 1);
    }
    deduped.push({ ...device, client_address: device.client_address ?? null });
  }
  return deduped;
}
