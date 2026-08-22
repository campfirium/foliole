import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { app, safeStorage } from 'electron';

import type { SyncProtocolDescriptor } from '../../lib/platform/syncProtocolContract.js';
import { loadDesktopSyncGroup } from '../database/syncGroupStore.js';
import { ensureSecureStorageBackend } from '../security/secureStorageBackend.js';

import { createMigratedPairingStorePayload } from './companionPairingStoreMigration.js';
import {
  isClientPeerRecord,
  isPairedAuthorizationRecord,
  type PairedCompanionAuthorization,
  type PairedSyncGroupPeer
} from './companionPairingStoreRecords.js';
import { PairingStoreDecryptionError, readEncryptedPairingStorePayload } from './pairingStoreEncryption.js';
import {
  restorePairingStoreFile,
  snapshotPairingStoreFile,
  writePairingStoreFile,
  type PairingStoreFileSnapshot
} from './pairingStoreFileTransaction.js';

export type { PairedSyncGroupPeer } from './companionPairingStoreRecords.js';

const STORE_FILE = 'companion-paired-devices.bin';
const STORE_FORMAT_VERSION = 3;
const CORRUPT_STORE_SUFFIX = '.corrupt-';

interface StorePayload {
  authorizations: PairedCompanionAuthorization[];
  client_peers: PairedSyncGroupPeer[];
  format_version: 3;
}

let cachedStore: StorePayload | null = null;
let cachedStorePath: string | null = null;

function resolveStorePath() {
  return path.join(app.getPath('userData'), STORE_FILE);
}

function readRaw(): Record<string, unknown> {
  const storePath = resolveStorePath();
  if (!fs.existsSync(storePath)) return { authorizations: [], client_peers: [], format_version: STORE_FORMAT_VERSION };
  ensureSecureStorageBackend('companion pairing secrets');
  return readEncryptedPairingStorePayload(fs.readFileSync(storePath), storePath) as Record<string, unknown>;
}

function readStoreStrict(): StorePayload {
  const storePath = resolveStorePath();
  if (cachedStore && cachedStorePath === storePath) return cachedStore;
  const parsed = readRaw();
  if (parsed.format_version !== STORE_FORMAT_VERSION) {
    migratePairedCompanionStore(resolveCurrentAuthorization);
    return readStoreStrict();
  }
  const authorizations = Array.isArray(parsed.authorizations)
    ? parsed.authorizations.filter(isPairedAuthorizationRecord) : [];
  const peers = Array.isArray(parsed.client_peers) ? parsed.client_peers.filter(isClientPeerRecord) : [];
  if (authorizations.length !== (parsed.authorizations as unknown[]).length ||
      peers.length !== (parsed.client_peers as unknown[]).length) {
    throw new Error('pairing_store_authorization_records_invalid');
  }
  cachedStore = { authorizations, client_peers: peers, format_version: STORE_FORMAT_VERSION };
  cachedStorePath = storePath;
  return cachedStore;
}

function resolveCurrentAuthorization(hostName: string) {
  return loadDesktopSyncGroup()?.members.find((member) => member.host_name === hostName)?.authorization_id ?? null;
}

function readStoreForQuery(): StorePayload {
  try {
    return readStoreStrict();
  } catch (error) {
    if (!(error instanceof PairingStoreDecryptionError)) throw error;
    if (error.preserveStore) throw error;
    const storePath = error.storePath;
    fs.renameSync(storePath, `${storePath}${CORRUPT_STORE_SUFFIX}${Date.now()}`);
    return { authorizations: [], client_peers: [], format_version: STORE_FORMAT_VERSION };
  }
}

function writeStore(payload: StorePayload) {
  ensureSecureStorageBackend('companion pairing secrets');
  const normalized = {
    authorizations: dedupeAuthorizations(payload.authorizations),
    client_peers: dedupePeers(payload.client_peers),
    format_version: 3 as const
  };
  writePairingStoreFile(resolveStorePath(), safeStorage.encryptString(JSON.stringify(normalized)));
  cachedStore = normalized;
  cachedStorePath = resolveStorePath();
}

export function migratePairedCompanionStore(
  resolveAuthorization: (hostName: string) => string | null
) {
  const snapshot = snapshotPairedCompanionStore();
  try {
    const raw = readRaw();
    if (raw.format_version === STORE_FORMAT_VERSION) return false;
    writeStore(createMigratedPairingStorePayload(raw, resolveAuthorization));
    return true;
  } catch (error) {
    restorePairedCompanionStore(snapshot);
    throw error;
  }
}

export function countPairedCompanionAuthorizations() {
  return readStoreForQuery().authorizations.length;
}

export function loadPairedCompanionAuthorizations() {
  return readStoreForQuery().authorizations.map(redactCredentialSecret);
}

function redactCredentialSecret({ credential_secret: credentialSecret, ...item }: PairedCompanionAuthorization) {
  void credentialSecret;
  return item;
}

export function loadPairedCompanionAuthorization(authorizationId: string) {
  return readStoreForQuery().authorizations.find((item) => item.authorization_id === authorizationId.trim()) ?? null;
}

export function removePairedCompanionAuthorization(authorizationId: string) {
  const store = readStoreStrict();
  const next = store.authorizations.filter((item) => item.authorization_id !== authorizationId.trim());
  if (next.length === store.authorizations.length) return false;
  writeStore({ ...store, authorizations: next });
  return true;
}

export function registerPairedCompanionAuthorization(args: {
  authorizationId: string; clientAddress?: string | null; hostName: string; hostPlatform: string;
  negotiatedProtocolVersion: number; pairedAt?: string; remoteProtocol: SyncProtocolDescriptor;
}) {
  return registerPairedCompanionAuthorizationWithSecret({
    ...args, credentialSecret: randomBytes(32).toString('base64url')
  });
}

export function registerPairedCompanionAuthorizationWithSecret(args: {
  authorizationId: string; clientAddress?: string | null; credentialSecret: string;
  hostName: string; hostPlatform: string;
  negotiatedProtocolVersion: number;
  pairedAt?: string; remoteProtocol: SyncProtocolDescriptor;
}) {
  const next = createPairedAuthorization(args);
  const store = readStoreStrict();
  writeStore({ ...store, authorizations: [...store.authorizations, next] });
  return next;
}

export function registerPairedCompanionAuthorizationWithPeer(args: {
  authorizationId: string; clientAddress?: string | null; hostName: string; hostPlatform: string;
  negotiatedProtocolVersion: number; pairedAt?: string; peer: PairedSyncGroupPeer;
  remoteProtocol: SyncProtocolDescriptor;
}) {
  const next = createPairedAuthorization({
    ...args, credentialSecret: randomBytes(32).toString('base64url')
  });
  const store = readStoreStrict();
  writeStore({
    ...store,
    authorizations: [...store.authorizations, next],
    client_peers: [...store.client_peers, args.peer]
  });
  return next;
}

function createPairedAuthorization(args: {
  authorizationId: string; clientAddress?: string | null; credentialSecret: string;
  hostName: string; hostPlatform: string; negotiatedProtocolVersion: number;
  pairedAt?: string; remoteProtocol: SyncProtocolDescriptor;
}): PairedCompanionAuthorization {
  return {
    authorization_id: args.authorizationId.trim(), client_address: args.clientAddress?.trim() || null,
    credential_secret: args.credentialSecret, host_name: args.hostName.trim(),
    host_platform: args.hostPlatform.trim(), negotiated_protocol_version: args.negotiatedProtocolVersion,
    paired_at: args.pairedAt ?? new Date().toISOString(), remote_protocol: args.remoteProtocol
  };
}

export function savePairedSyncGroupPeer(peer: PairedSyncGroupPeer) {
  const store = readStoreStrict();
  writeStore({ ...store, client_peers: [...store.client_peers, peer] });
  return peer;
}

export function loadPairedSyncGroupPeer(groupId: string, peerAuthorizationId: string) {
  return readStoreForQuery().client_peers.find((peer) =>
    peer.group_id === groupId && peer.peer_authorization_id === peerAuthorizationId) ?? null;
}

export function loadPairedSyncGroupPeers(groupId: string) {
  return readStoreForQuery().client_peers.filter((peer) => peer.group_id === groupId);
}

export function removeSyncGroupPeerCredentials(groupId: string, authorizationId: string) {
  const store = readStoreStrict();
  writeStore({ ...store,
    authorizations: store.authorizations.filter((item) => item.authorization_id !== authorizationId),
    client_peers: store.client_peers.filter((peer) =>
      peer.group_id !== groupId || peer.peer_authorization_id !== authorizationId) });
}

export function snapshotPairedCompanionStore(): PairingStoreFileSnapshot {
  return snapshotPairingStoreFile(resolveStorePath());
}

export function restorePairedCompanionStore(snapshot: PairingStoreFileSnapshot) {
  restorePairingStoreFile(resolveStorePath(), snapshot);
  cachedStore = null;
  cachedStorePath = null;
}

export function clearPairedCompanionAuthorizations() {
  fs.rmSync(resolveStorePath(), { force: true });
  cachedStore = null;
  cachedStorePath = null;
}

function dedupeAuthorizations(items: PairedCompanionAuthorization[]) {
  return [...new Map(items.map((item) => [item.authorization_id, item])).values()];
}

function dedupePeers(items: PairedSyncGroupPeer[]) {
  return [...new Map(items.map((item) => [`${item.group_id}\0${item.peer_authorization_id}`, item])).values()];
}
