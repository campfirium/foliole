// @vitest-environment node

import { expect, it, vi } from 'vitest';

import type { MacosSecurityScopedBookmarkAdapter } from '../macosSecurityScopedBookmarksNative.js';

vi.mock('electron', () => ({ app: { isPackaged: true }, safeStorage: { encryptString: vi.fn() } }));

import {
  LegacyPairingStoreMigrationError,
  migrateLegacyMacosPairingCiphertext
} from './macosLegacyPairingStoreMigration.js';

function adapter(
  result: { errorCode: string; message: string; ok: false } | { ok: true; plaintext: string }
): MacosSecurityScopedBookmarkAdapter {
  return { decryptLegacyMasSafeStorage: vi.fn(() => result) } as unknown as MacosSecurityScopedBookmarkAdapter;
}

it('decrypts the exact legacy MAS key shape and immediately re-encrypts with current safeStorage', () => {
  const encryptString = vi.fn(() => Buffer.from('current-key-ciphertext'));
  const result = migrateLegacyMacosPairingCiphertext(Buffer.from('legacy-ciphertext'), {
    adapter: adapter({ ok: true, plaintext: '{"devices":[]}' }),
    encryptString,
    isMas: false,
    isPackaged: true,
    platform: 'darwin'
  });
  expect(result).toEqual({
    encrypted: Buffer.from('current-key-ciphertext'),
    plaintext: '{"devices":[]}'
  });
  expect(encryptString).toHaveBeenCalledWith('{"devices":[]}');
});

it('refuses to treat an unavailable legacy key as corrupt data', () => {
  expect(() => migrateLegacyMacosPairingCiphertext(Buffer.from('legacy-ciphertext'), {
    adapter: adapter({ errorCode: 'legacy_key_unavailable', message: 'unavailable', ok: false }),
    isMas: false,
    isPackaged: true,
    platform: 'darwin'
  })).toThrowError(new LegacyPairingStoreMigrationError('legacy_key_unavailable'));
});

it('does not attempt the migration outside a packaged direct-distribution macOS app', () => {
  const native = adapter({ ok: true, plaintext: '{"devices":[]}' });
  expect(migrateLegacyMacosPairingCiphertext(Buffer.from('ciphertext'), {
    adapter: native, isMas: true, isPackaged: true, platform: 'darwin'
  })).toBeNull();
  expect(native.decryptLegacyMasSafeStorage).not.toHaveBeenCalled();
});
