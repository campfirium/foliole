// @vitest-environment node
import { expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ app: { getLocale: () => 'en', isPackaged: true } }));
vi.mock('../mainWindowRegistry.js', () => ({ getMainWindow: () => null }));

import { ensureWindowsSyncNetworkPermission } from './windowsSyncNetworkPermission.js';

it('turns on sync without prompting when the installed permission is ready', async () => {
  const confirm = vi.fn(async () => true);
  const grant = vi.fn(async () => 'ready' as const);
  await expect(ensureWindowsSyncNetworkPermission({ platform: 'win32', packaged: true,
    check: async () => 'ready', confirm, grant })).resolves.toBe(true);
  expect(confirm).not.toHaveBeenCalled();
  expect(grant).not.toHaveBeenCalled();
});

it('requests authorization from the sync switch and leaves it off when cancelled', async () => {
  const grant = vi.fn(async () => 'ready' as const);
  await expect(ensureWindowsSyncNetworkPermission({ platform: 'win32', packaged: true,
    check: async () => 'authorization_required', confirm: async () => false, grant })).resolves.toBe(false);
  expect(grant).not.toHaveBeenCalled();
  await expect(ensureWindowsSyncNetworkPermission({ platform: 'win32', packaged: true,
    check: async () => 'authorization_required', confirm: async () => true,
    grant: async () => 'authorization_cancelled' })).resolves.toBe(false);
});

it('requires a Private network before asking for elevation', async () => {
  const confirm = vi.fn(async () => true);
  await expect(ensureWindowsSyncNetworkPermission({ platform: 'win32', packaged: true,
    check: async () => 'private_network_required', confirm })).rejects.toThrow('not Private');
  expect(confirm).not.toHaveBeenCalled();
});

it('enables only after a successful recheck and reports policy restrictions', async () => {
  await expect(ensureWindowsSyncNetworkPermission({ platform: 'win32', packaged: true,
    check: async () => 'authorization_required', confirm: async () => true,
    grant: async () => 'ready' })).resolves.toBe(true);
  await expect(ensureWindowsSyncNetworkPermission({ platform: 'win32', packaged: true,
    check: async () => 'authorization_required', confirm: async () => true,
    grant: async () => 'policy_restricted' })).rejects.toThrow('Windows policy');
});

it('does not open a Windows authorization flow on macOS', async () => {
  const check = vi.fn(async () => 'authorization_required' as const);
  await expect(ensureWindowsSyncNetworkPermission({ platform: 'darwin', packaged: true,
    check })).resolves.toBe(true);
  expect(check).not.toHaveBeenCalled();
});
