// @vitest-environment node

import { expect, it } from 'vitest';

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

it('rejects the unprotected Linux basic_text backend', () => {
  expect(() => ensureSecureStorageBackend(
    'test secret', 'linux', storage(true, 'basic_text')
  )).toThrow('Secure system storage is unavailable');
});
