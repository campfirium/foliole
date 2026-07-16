import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { app, safeStorage } from 'electron';

function ensureSecureBackend(label: string) {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error(`Electron safeStorage is unavailable for ${label}.`);
  }
  if (process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text') {
    throw new Error(`Secure system storage is unavailable for ${label}.`);
  }
}

function resolveSecretPath(fileName: string) {
  return path.join(app.getPath('userData'), fileName);
}

export function hasPublishDeviceSecret(fileName: string) {
  return fs.existsSync(resolveSecretPath(fileName));
}

export function readPublishDeviceSecret(fileName: string, label: string) {
  const secretPath = resolveSecretPath(fileName);
  if (!fs.existsSync(secretPath)) return '';
  ensureSecureBackend(label);
  return safeStorage.decryptString(fs.readFileSync(secretPath));
}

export function writePublishDeviceSecret(fileName: string, label: string, value: string) {
  ensureSecureBackend(label);
  const secretPath = resolveSecretPath(fileName);
  const temporaryPath = `${secretPath}.${randomUUID()}.tmp`;
  fs.mkdirSync(path.dirname(secretPath), { recursive: true });
  try {
    fs.writeFileSync(temporaryPath, safeStorage.encryptString(value), { mode: 0o600 });
    fs.renameSync(temporaryPath, secretPath);
  } finally {
    if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
  }
}

export function deletePublishDeviceSecret(fileName: string) {
  const secretPath = resolveSecretPath(fileName);
  if (!fs.existsSync(secretPath)) return false;
  fs.unlinkSync(secretPath);
  return true;
}
