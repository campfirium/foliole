import fs from 'node:fs';
import path from 'node:path';

import { app, safeStorage } from 'electron';

import type { NativeReadwiseTokenConnection } from '../../lib/platform/nativeReadwiseContract.js';
import { canDesktopRunExternalSources } from '../sync/primaryDeviceState.js';

const READWISE_AUTH_URL = 'https://readwise.io/api/v2/auth/';
const TOKEN_STORE_FILE = 'readwise-token.bin';

function now() {
  return new Date().toISOString();
}

function status(status: NativeReadwiseTokenConnection['status'], message: string): NativeReadwiseTokenConnection {
  return {
    checked_at: now(),
    connected: status === 'connected',
    message,
    status
  };
}

function resolveStorePath() {
  return path.join(app.getPath('userData'), TOKEN_STORE_FILE);
}

function canUseEncryption() {
  return safeStorage.isEncryptionAvailable();
}

function readStoredToken() {
  const storePath = resolveStorePath();
  if (!fs.existsSync(storePath)) {
    return null;
  }
  if (!canUseEncryption()) {
    return null;
  }
  const decrypted = safeStorage.decryptString(fs.readFileSync(storePath));
  return decrypted.trim() || null;
}

export function loadReadwiseTokenSecretForCredentialBag() {
  return readStoredToken();
}

function writeStoredToken(token: string) {
  if (!canUseEncryption()) {
    return false;
  }
  fs.mkdirSync(path.dirname(resolveStorePath()), { recursive: true });
  fs.writeFileSync(resolveStorePath(), safeStorage.encryptString(token.trim()));
  return true;
}

function clearStoredToken() {
  fs.rmSync(resolveStorePath(), { force: true });
}

async function validateReadwiseToken(token: string) {
  const response = await fetch(READWISE_AUTH_URL, {
    headers: { Authorization: `Token ${token}` },
    method: 'GET'
  });
  if (response.status === 204) {
    return status('connected', 'Connected to Readwise.');
  }
  if (response.status === 401 || response.status === 403) {
    return status('invalid_token', 'Readwise rejected this token. Reconnect with a current token.');
  }
  if (response.status === 429) {
    return status('rate_limited', 'Readwise is rate limiting requests. Try again later.');
  }
  return status('network_error', `Readwise auth check failed with HTTP ${response.status}.`);
}

export function loadReadwiseTokenConnection(): NativeReadwiseTokenConnection {
  if (!fs.existsSync(resolveStorePath())) {
    return {
      checked_at: null,
      connected: false,
      message: 'Readwise is not connected.',
      status: 'not_connected'
    };
  }
  if (!canUseEncryption()) {
    return status('storage_unavailable', 'Secure storage is unavailable. Fix the system keyring before connecting Readwise.');
  }
  return readStoredToken()
    ? status('connected', 'Readwise token is saved on this device.')
    : status('invalid_token', 'Saved Readwise token could not be read. Reconnect with a current token.');
}

export async function connectReadwiseToken(token: string): Promise<NativeReadwiseTokenConnection> {
  const normalizedToken = token.trim();
  if (!normalizedToken) {
    return status('invalid_token', 'Readwise token is required.');
  }
  if (!canDesktopRunExternalSources()) {
    return status('not_connected', 'Readwise can be connected only on the current primary device.');
  }
  if (!canUseEncryption()) {
    return status('storage_unavailable', 'Secure storage is unavailable. Fix the system keyring before connecting Readwise.');
  }
  let result: NativeReadwiseTokenConnection;
  try {
    result = await validateReadwiseToken(normalizedToken);
  } catch {
    return status('network_error', 'Could not reach Readwise. Check the connection and try again.');
  }
  if (!result.connected) {
    return result;
  }
  return writeStoredToken(normalizedToken)
    ? result
    : status('storage_unavailable', 'Secure storage is unavailable. Fix the system keyring before connecting Readwise.');
}

export function disconnectReadwiseToken(): NativeReadwiseTokenConnection {
  clearStoredToken();
  return {
    checked_at: null,
    connected: false,
    message: 'Readwise token was removed from this device.',
    status: 'not_connected'
  };
}
