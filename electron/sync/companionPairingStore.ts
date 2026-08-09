import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { app, safeStorage } from 'electron';

import type { SyncProtocolDescriptor } from '../../lib/platform/syncProtocolContract.js';
import { ensureSecureStorageBackend } from '../security/secureStorageBackend.js';

import {
  isClientPeerRecord,
  isPairedDeviceRecord,
  type PairedCompanionDevice,
  type PairedSyncGroupPeer
} from './companionPairingStoreRecords.js';
import {
  PairingStoreDecryptionError,
  readEncryptedPairingStorePayload
} from './pairingStoreEncryption.js';

export type { PairedSyncGroupPeer } from './companionPairingStoreRecords.js';

const PAIRED_DEVICE_STORE_FILE = 'companion-paired-devices.bin';
const CORRUPT_STORE_SUFFIX = '.corrupt-';

interface PairedDeviceStorePayload {
  client_peers: PairedSyncGroupPeer[];
  devices: PairedCompanionDevice[];
}

let cachedStore: PairedDeviceStorePayload | null = null;
let cachedStorePath: string | null = null;

function resolveStorePath() {
  return path.join(app.getPath('userData'), PAIRED_DEVICE_STORE_FILE);
}

function readStoreStrict(): PairedDeviceStorePayload {
  const storePath = resolveStorePath();
  if (cachedStore && cachedStorePath === storePath) {
    return cachedStore;
  }
  if (!fs.existsSync(storePath)) {
    cachedStorePath = storePath;
    cachedStore = { client_peers: [], devices: [] };
    return cachedStore;
  }
  ensureSecureStorageBackend('companion pairing secrets');
  const encrypted = fs.readFileSync(storePath);
  const parsed = readEncryptedPairingStorePayload(encrypted, storePath) as Partial<PairedDeviceStorePayload>;
  cachedStore = {
    client_peers: Array.isArray(parsed.client_peers) ? parsed.client_peers.filter(isClientPeerRecord) : [],
    devices: Array.isArray(parsed.devices) ? parsed.devices.filter(isPairedDeviceRecord) : []
  };
  cachedStorePath = storePath;
  return cachedStore;
}

function readStoreForQuery(): PairedDeviceStorePayload {
  try {
    return readStoreStrict();
  } catch (error) {
    if (!(error instanceof PairingStoreDecryptionError)) {
      throw error;
    }
    if (error.preserveStore) throw error;
    quarantineUnreadableStore(error.storePath, error.cause);
    return { client_peers: [], devices: [] };
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
  ensureSecureStorageBackend('companion pairing secrets');
  fs.mkdirSync(path.dirname(resolveStorePath()), { recursive: true });
  const encrypted = safeStorage.encryptString(JSON.stringify({
    client_peers: payload.client_peers,
    devices: dedupePairedDevices(payload.devices)
  }));
  fs.writeFileSync(resolveStorePath(), encrypted);
  cachedStore = {
    client_peers: payload.client_peers,
    devices: dedupePairedDevices(payload.devices)
  };
  cachedStorePath = resolveStorePath();
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
  writeStore({ client_peers: store.client_peers, devices: nextDevices });
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
  return registerPairedCompanionDeviceWithSecret({ ...args, deviceSecret: randomBytes(32).toString('base64url') });
}

export function registerPairedCompanionDeviceWithSecret(args: {
  clientAddress?: string | null;
  deviceId: string;
  deviceKind: string;
  deviceName: string;
  deviceSecret: string;
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
    device_secret: args.deviceSecret,
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

export function savePairedSyncGroupPeer(peer: PairedSyncGroupPeer) {
  const store = readStoreStrict();
  store.client_peers = store.client_peers.filter((candidate) =>
    candidate.group_id !== peer.group_id || candidate.peer_device_id !== peer.peer_device_id);
  store.client_peers.push(peer);
  writeStore(store);
  return peer;
}

export function loadPairedSyncGroupPeer(groupId: string, peerDeviceId: string) {
  return readStoreForQuery().client_peers.find((peer) =>
    peer.group_id === groupId && peer.peer_device_id === peerDeviceId) ?? null;
}

export function loadPairedSyncGroupPeers(groupId: string) {
  return readStoreForQuery().client_peers.filter((peer) => peer.group_id === groupId);
}

export function removeSyncGroupPeerCredentials(groupId: string, deviceId: string) {
  const store = readStoreStrict();
  store.client_peers = store.client_peers.filter((peer) =>
    peer.group_id !== groupId || peer.peer_device_id !== deviceId);
  store.devices = store.devices.filter((device) => device.device_id !== deviceId);
  writeStore(store);
}

export function clearPairedCompanionDevices() {
  writeStore({ client_peers: [], devices: [] });
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
