import {
  isSyncGroupSecureRouteMetadata,
  type SyncGroupSecureRouteMetadata
} from '../../lib/platform/syncGroupAuthorizationContract.js';

export interface StoredSyncGroupSecureRoute extends SyncGroupSecureRouteMetadata {
  credential_secret: string;
}

export interface StoredSyncGroupNonce {
  expires_at: number;
  identity: string;
}

export interface SyncGroupAuthorizationStorePayload {
  format_version: 1;
  nonces: StoredSyncGroupNonce[];
  routes: StoredSyncGroupSecureRoute[];
}

export function parseSyncGroupAuthorizationStorePayload(value: unknown): SyncGroupAuthorizationStorePayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalidStore();
  const record = value as Record<string, unknown>;
  if (record.format_version !== 1 || !Array.isArray(record.routes) || !Array.isArray(record.nonces)) {
    throw invalidStore();
  }
  const routes = record.routes.filter(isStoredRoute);
  const nonces = record.nonces.filter(isStoredNonce);
  if (routes.length !== record.routes.length || nonces.length !== record.nonces.length) throw invalidStore();
  return { format_version: 1, nonces, routes };
}

function isStoredRoute(value: unknown): value is StoredSyncGroupSecureRoute {
  return isSyncGroupSecureRouteMetadata(value) &&
    typeof (value as StoredSyncGroupSecureRoute).credential_secret === 'string' &&
    Boolean((value as StoredSyncGroupSecureRoute).credential_secret.trim());
}

function isStoredNonce(value: unknown): value is StoredSyncGroupNonce {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.identity === 'string' && Boolean(record.identity.trim()) &&
    Number.isFinite(record.expires_at);
}

function invalidStore() {
  return new Error('sync_group_authorization_store_invalid');
}
