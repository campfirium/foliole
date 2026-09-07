import { randomUUID } from 'node:crypto';

import { clipboard } from 'electron';

import {
  normalizeReadwiseHostSettings,
  READWISE_HOST_SETTINGS_KEY,
  type ReadwiseHostApiConnection,
  type ReadwiseHostSettings
} from '../../lib/core/import/readwiseHostSettings.js';
import type { NativeReadwiseApiConnectionResult } from '../../lib/platform/nativeReadwiseApiConnectionContract.js';
import { loadReadwiseHostAssignment } from '../database/readwiseHostAssignment.js';
import { saveJsonSetting } from '../database/settingsStore.js';
import { ensureSecureStorageBackend } from '../security/secureStorageBackend.js';

import {
  loadStoredReadwiseHostSettings,
  toPublicReadwiseApiConnection
} from './readwiseApiConnectionState.js';
import {
  deleteReadwiseApiSecret,
  readReadwiseApiSecret,
  writeReadwiseApiSecret
} from './readwiseApiSecret.js';

const READWISE_AUTH_URL = 'https://readwise.io/api/v2/auth/';

interface ConnectionDependencies {
  fetchImpl?: typeof fetch;
  readClipboard?: () => string;
}

function result(status: NativeReadwiseApiConnectionResult['status'], retryAfterSeconds?: number) {
  return {
    connection: toPublicReadwiseApiConnection(),
    ...(retryAfterSeconds === undefined ? {} : { retry_after_seconds: retryAfterSeconds }),
    status
  } satisfies NativeReadwiseApiConnectionResult;
}

function saveConnection(settings: ReadwiseHostSettings, apiConnection: ReadwiseHostApiConnection) {
  const updatedAt = new Date().toISOString();
  saveJsonSetting(READWISE_HOST_SETTINGS_KEY, normalizeReadwiseHostSettings({
    ...settings,
    apiConnection,
    updatedAt
  }), updatedAt);
}

function saveReconnectRequired(settings: ReadwiseHostSettings) {
  saveConnection(settings, {
    ...settings.apiConnection,
    state: 'reconnect_required'
  });
}

function retryAfterSeconds(response: Response) {
  const parsed = Number(response.headers.get('retry-after'));
  return Number.isFinite(parsed) && parsed >= 0 ? Math.ceil(parsed) : undefined;
}

async function authenticate(token: string, fetchImpl: typeof fetch) {
  return fetchImpl(READWISE_AUTH_URL, {
    headers: { Authorization: `Token ${token}` },
    method: 'GET',
    redirect: 'error',
    signal: AbortSignal.timeout(15_000)
  });
}

export function loadReadwiseApiConnection() {
  return toPublicReadwiseApiConnection();
}

export async function connectReadwiseApiFromClipboard(
  dependencies: ConnectionDependencies = {}
): Promise<NativeReadwiseApiConnectionResult> {
  if (!loadReadwiseHostAssignment().is_active) return result('not_active_host');
  const settings = loadStoredReadwiseHostSettings();
  if (settings.readwiseSourceMode !== 'api') return result('source_mode_mismatch');
  try {
    ensureSecureStorageBackend('Readwise API token');
  } catch {
    return result('secure_storage_unavailable');
  }
  const clipboardValue = await Promise.resolve(
    (dependencies.readClipboard ?? (() => clipboard.readText()))()
  );
  const token = clipboardValue.trim();
  if (!token) return result('token_missing');
  let response: Response;
  try {
    response = await authenticate(token, dependencies.fetchImpl ?? fetch);
  } catch {
    return result('connection_failed');
  }
  if (response.status === 401 || response.status === 403) {
    saveReconnectRequired(settings);
    return result('reconnect_required');
  }
  if (response.status === 429) return result('rate_limited', retryAfterSeconds(response));
  if (response.status !== 204) return result('connection_failed');
  const secretRef = settings.apiConnection.secretRef ?? `readwise-api-${randomUUID()}.bin`;
  let previousToken = '';
  try {
    previousToken = settings.apiConnection.secretRef
      ? readReadwiseApiSecret(settings.apiConnection.secretRef) : '';
  } catch {
    return result('secure_storage_unavailable');
  }
  writeReadwiseApiSecret(secretRef, token);
  try {
    const verifiedAt = new Date().toISOString();
    saveConnection(settings, { secretRef, state: 'connected', verifiedAt });
  } catch (error) {
    if (previousToken) writeReadwiseApiSecret(secretRef, previousToken);
    else deleteReadwiseApiSecret(secretRef);
    throw error;
  }
  return result('connected');
}

export function disconnectReadwiseApi(): NativeReadwiseApiConnectionResult {
  if (!loadReadwiseHostAssignment().is_active) return result('not_active_host');
  const settings = loadStoredReadwiseHostSettings();
  const secretRef = settings.apiConnection.secretRef;
  let previousToken = '';
  try {
    ensureSecureStorageBackend('Readwise API token');
    previousToken = secretRef ? readReadwiseApiSecret(secretRef) : '';
  } catch {
    return result('secure_storage_unavailable');
  }
  if (secretRef) deleteReadwiseApiSecret(secretRef);
  try {
    saveConnection(settings, { secretRef: null, state: 'disconnected', verifiedAt: null });
  } catch (error) {
    if (secretRef && previousToken) writeReadwiseApiSecret(secretRef, previousToken);
    throw error;
  }
  return result('disconnected');
}
