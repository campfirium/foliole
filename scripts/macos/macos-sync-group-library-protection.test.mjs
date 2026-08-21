import { expect, it, vi } from 'vitest';

import {
  resolveMacosProtectionIdentity, runMacosSyncGroupLibraryProtection
} from './macos-sync-group-library-protection.mjs';

it('does not recover pairing Device identity from the Host member roster', () => {
  expect(() => resolveMacosProtectionIdentity({ activeHosts: { darwin: ['Mac A'] },
    departedHosts: { darwin: ['Mac Before Rename'] }, deviceIdentity: null }))
    .toThrow('not independently available');
});

it('stops the registered owner and refuses protection while any database owner remains', async () => {
  const stopOwner = vi.fn(async () => true);
  await expect(runMacosSyncGroupLibraryProtection({ candidate: 'a'.repeat(40),
    executeProcess: async (command) => command === '/usr/sbin/lsof'
      ? { code: 0, stderr: '', stdout: '123\n' } : { code: 1, stderr: '', stdout: '' },
    label: 'original', repoRoot: '/repo', stopOwner })).rejects.toThrow('active owner');
  expect(stopOwner).toHaveBeenCalledOnce();
});
