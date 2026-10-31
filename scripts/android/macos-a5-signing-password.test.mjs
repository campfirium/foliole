// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { spawnSync } from 'node:child_process';
import { uploadSigningPassword } from './macos-a5-signing-password.mjs';

vi.mock('node:child_process', () => ({ spawnSync: vi.fn() }));
afterEach(() => vi.resetAllMocks());
const config = { keychain: { service: 'com.campfirium.foliole.android.upload', account: 'upload' } };

it('reads the exact Keychain item without putting its password in process arguments', () => {
  spawnSync.mockReturnValue({ status: 0, stdout: 'test-password\n' });
  expect(uploadSigningPassword(config)).toBe('test-password');
  expect(spawnSync).toHaveBeenCalledWith('/usr/bin/security', ['find-generic-password',
    '-s', config.keychain.service, '-a', 'upload', '-w'], { encoding: 'utf8', timeout: 15000 });
});

it.each([
  { status: 44, stdout: '', stderr: 'private diagnostics' },
  { status: null, error: new Error('private diagnostics') },
])('fails without exposing Keychain diagnostics or falling back to a file', (result) => {
  spawnSync.mockReturnValue(result);
  expect(() => uploadSigningPassword({ ...config, passwordFile: '/unreadable' }))
    .toThrow('Upload signing Keychain password is unavailable.');
});

it.each(['', '\n', 'first\nsecond\n', 'first\rsecond'])('rejects invalid stored password %j', (stdout) => {
  spawnSync.mockReturnValue({ status: 0, stdout });
  expect(() => uploadSigningPassword(config)).toThrow('Upload signing password is invalid.');
});
