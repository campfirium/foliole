import { safeStorage } from 'electron';

interface SecureStorageAdapter {
  getSelectedStorageBackend: () => string;
  isEncryptionAvailable: () => boolean;
}

export function ensureSecureStorageBackend(
  label: string,
  platform = process.platform,
  storage: SecureStorageAdapter = safeStorage
) {
  if (!storage.isEncryptionAvailable()) {
    throw new Error(`Electron safeStorage is unavailable for ${label}.`);
  }
  if (platform === 'linux' && storage.getSelectedStorageBackend() === 'basic_text') {
    throw new Error(`Secure system storage is unavailable for ${label}.`);
  }
}
