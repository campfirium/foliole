import { safeStorage } from 'electron';

interface SecureStorageAdapter {
  getSelectedStorageBackend: () => string;
  isEncryptionAvailable: () => boolean;
}

const unavailableStorage = new WeakSet<SecureStorageAdapter>();

function isSecureStorageAvailable(storage: SecureStorageAdapter) {
  if (unavailableStorage.has(storage)) return false;
  const available = storage.isEncryptionAvailable();
  if (!available) unavailableStorage.add(storage);
  return available;
}

export function ensureSecureStorageBackend(
  label: string,
  platform = process.platform,
  storage: SecureStorageAdapter = safeStorage
) {
  if (!isSecureStorageAvailable(storage)) {
    throw new Error(`Electron safeStorage is unavailable for ${label}.`);
  }
  if (platform === 'linux' && storage.getSelectedStorageBackend() === 'basic_text') {
    throw new Error(`Secure system storage is unavailable for ${label}.`);
  }
}
