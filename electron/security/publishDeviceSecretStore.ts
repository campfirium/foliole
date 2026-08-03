import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { app, safeStorage } from 'electron';

import { ensureSecureStorageBackend } from './secureStorageBackend.js';

function resolveSecretPath(fileName: string) {
  return path.join(app.getPath('userData'), fileName);
}

export function hasPublishDeviceSecret(fileName: string) {
  return fs.existsSync(resolveSecretPath(fileName));
}

export function readPublishDeviceSecret(fileName: string, label: string) {
  const secretPath = resolveSecretPath(fileName);
  if (!fs.existsSync(secretPath)) return '';
  ensureSecureStorageBackend(label);
  return safeStorage.decryptString(fs.readFileSync(secretPath));
}

export function writePublishDeviceSecret(fileName: string, label: string, value: string) {
  ensureSecureStorageBackend(label);
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
