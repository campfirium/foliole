import fs from 'node:fs';
import path from 'node:path';

import { app, safeStorage } from 'electron';

import type { SyncGroupSecureRouteMetadata } from '../../lib/platform/syncGroupAuthorizationContract.js';
import { ensureSecureStorageBackend } from '../security/secureStorageBackend.js';

import {
  restorePairingStoreFile,
  snapshotPairingStoreFile,
  writePairingStoreFile,
  type PairingStoreFileSnapshot
} from './pairingStoreFileTransaction.js';
import {
  signSyncGroupRoute,
  verifySyncGroupRouteSignature,
  type RouteRequestFields
} from './syncGroupAuthorizationCrypto.js';
import {
  parseSyncGroupAuthorizationStorePayload,
  type StoredSyncGroupSecureRoute,
  type SyncGroupAuthorizationStorePayload
} from './syncGroupAuthorizationStoreRecords.js';

const STORE_FILE = 'sync-group-authorizations-v1.bin';
const AUTH_WINDOW_MS = 60_000;
const NONCE_TTL_MS = 120_000;

export interface SyncGroupAuthorizationStoreCrypto {
  assertAvailable(): void;
  decrypt(value: Buffer): string;
  encrypt(value: string): Buffer;
}

const electronSafeStorageCrypto: SyncGroupAuthorizationStoreCrypto = {
  assertAvailable() { ensureSecureStorageBackend('Sync Group route secrets'); },
  decrypt(value) { return safeStorage.decryptString(value); },
  encrypt(value) { return safeStorage.encryptString(value); }
};

export class SyncGroupAuthorizationStore {
  constructor(
    readonly storePath: string,
    private readonly crypto: SyncGroupAuthorizationStoreCrypto = electronSafeStorageCrypto
  ) {}

  load(routeId: string, kind?: SyncGroupSecureRouteMetadata['kind']) {
    const route = this.read().routes.find((item) => item.route_id === routeId.trim() && (!kind || item.kind === kind));
    return route ? redact(route) : null;
  }

  save(route: SyncGroupSecureRouteMetadata, credentialSecret: string) {
    if (!credentialSecret.trim()) throw new Error('sync_group_route_secret_required');
    const payload = this.read();
    const routes = payload.routes.filter((item) => item.route_id !== route.route_id);
    this.write({ ...payload, routes: [...routes, { ...route, credential_secret: credentialSecret.trim() }] });
    return this.load(route.route_id, route.kind)!;
  }

  sign(routeId: string, request: RouteRequestFields) {
    const route = this.requireActiveRoute(routeId, 'member');
    return signSyncGroupRoute(route, route.credential_secret, request);
  }

  verify(routeId: string, request: RouteRequestFields, signature: string, nowMs = Date.now()) {
    const route = this.requireActiveRoute(routeId, 'verification');
    if (!isFresh(request.timestamp, nowMs)) throw new Error('expired_timestamp');
    if (!verifySyncGroupRouteSignature({ request, route, secret: route.credential_secret, signature })) {
      throw new Error('invalid_signature');
    }
    const payload = this.read();
    const identity = `${route.route_id}:${request.timestamp}:${request.nonce}`;
    const nonces = payload.nonces.filter((nonce) => nonce.expires_at > nowMs);
    if (nonces.some((nonce) => nonce.identity === identity)) throw new Error('replayed_nonce');
    this.write({ ...payload, nonces: [...nonces, { expires_at: nowMs + NONCE_TTL_MS, identity }] });
    return redact(route);
  }

  revoke(routeId: string, kind?: SyncGroupSecureRouteMetadata['kind']) {
    const payload = this.read();
    const routes = payload.routes.filter((item) =>
      item.route_id !== routeId.trim() || Boolean(kind && item.kind !== kind));
    if (routes.length === payload.routes.length) return false;
    this.write({ ...payload, routes });
    return true;
  }

  snapshot(): PairingStoreFileSnapshot {
    return snapshotPairingStoreFile(this.storePath);
  }

  restore(snapshot: PairingStoreFileSnapshot) {
    restorePairingStoreFile(this.storePath, snapshot);
  }

  private requireActiveRoute(routeId: string, kind: SyncGroupSecureRouteMetadata['kind']) {
    const route = this.read().routes.find((item) => item.route_id === routeId.trim() && item.kind === kind);
    if (!route) throw new Error('sync_group_route_not_active');
    return route;
  }

  private read(): SyncGroupAuthorizationStorePayload {
    if (!fs.existsSync(this.storePath)) return { format_version: 1, nonces: [], routes: [] };
    this.crypto.assertAvailable();
    const plaintext = this.crypto.decrypt(fs.readFileSync(this.storePath));
    return parseSyncGroupAuthorizationStorePayload(JSON.parse(plaintext) as unknown);
  }

  private write(payload: SyncGroupAuthorizationStorePayload) {
    this.crypto.assertAvailable();
    writePairingStoreFile(this.storePath, this.crypto.encrypt(JSON.stringify(payload)));
  }
}

export function createInactiveSyncGroupAuthorizationStore() {
  return new SyncGroupAuthorizationStore(path.join(app.getPath('userData'), STORE_FILE));
}

function redact({ credential_secret: credentialSecret, ...route }: StoredSyncGroupSecureRoute) {
  void credentialSecret;
  return route;
}

function isFresh(timestamp: string, nowMs: number) {
  const timestampMs = Date.parse(timestamp);
  return Number.isFinite(timestampMs) && Math.abs(nowMs - timestampMs) <= AUTH_WINDOW_MS;
}
