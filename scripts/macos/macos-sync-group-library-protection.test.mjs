import { expect, it, vi } from 'vitest';

import {
  resolveMacosProtectionIdentity, runMacosSyncGroupLibraryProtection
} from './macos-sync-group-library-protection.mjs';

it('uses one proven departed darwin identity when A has already left the old group', () => {
  expect(resolveMacosProtectionIdentity({ departedDeviceIdentities: {
    darwin: ['departed-a'], win32: ['other']
  }, deviceIdentity: null })).toBe('departed-a');
  expect(() => resolveMacosProtectionIdentity({ departedDeviceIdentities: {
    darwin: ['a', 'conflict']
  }, deviceIdentity: null })).toThrow('not uniquely recoverable');
});

it('prefers one active darwin identity after A creates the new group', () => {
  expect(resolveMacosProtectionIdentity({ activeDeviceIdentities: { darwin: ['active-a'] },
    departedDeviceIdentities: { darwin: ['departed-a'] }, deviceIdentity: null })).toBe('active-a');
});

it('stops the registered owner and refuses protection while any database owner remains', async () => {
  const stopOwner = vi.fn(async () => true);
  await expect(runMacosSyncGroupLibraryProtection({ candidate: 'a'.repeat(40),
    executeProcess: async (command) => command === '/usr/sbin/lsof'
      ? { code: 0, stderr: '', stdout: '123\n' } : { code: 1, stderr: '', stdout: '' },
    label: 'original', repoRoot: '/repo', stopOwner })).rejects.toThrow('active owner');
  expect(stopOwner).toHaveBeenCalledOnce();
});
