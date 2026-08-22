// @vitest-environment node

import { expect, it, vi } from 'vitest';

import { ensureSecureStorageBackend } from './secureStorageBackend.js';

function storage(available: boolean, backend: string) {
  return {
    getSelectedStorageBackend: () => backend,
    isEncryptionAvailable: () => available
  };
}

it('accepts an available Linux system secret service', () => {
  expect(() => ensureSecureStorageBackend(
    'test secret', 'linux', storage(true, 'gnome_libsecret')
  )).not.toThrow();
});

it('rejects unavailable encryption on every platform', () => {
  expect(() => ensureSecureStorageBackend(
    'test secret', 'win32', storage(false, 'dpapi')
  )).toThrow('safeStorage is unavailable');
});

it('reports repeated refusal without re-entering the system credential provider', () => {
  const isEncryptionAvailable = vi.fn(() => false);
  const unavailable = { getSelectedStorageBackend: () => 'keychain', isEncryptionAvailable };

  for (let attempt = 0; attempt < 3; attempt += 1) {
    expect(() => ensureSecureStorageBackend('pairing secrets', 'darwin', unavailable))
      .toThrow('safeStorage is unavailable');
  }
  expect(isEncryptionAvailable).toHaveBeenCalledTimes(1);
});

it('rejects the unprotected Linux basic_text backend', () => {
  expect(() => ensureSecureStorageBackend(
    'test secret', 'linux', storage(true, 'basic_text')
  )).toThrow('Secure system storage is unavailable');
});
