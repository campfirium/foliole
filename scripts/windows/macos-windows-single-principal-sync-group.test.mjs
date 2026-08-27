// @vitest-environment node

import fs from 'node:fs';

import { expect, it, vi } from 'vitest';

import { waitForMacosProvider } from './macos-windows-single-principal-sync-group.mjs';

it('waits for the exact reachable Mac provider before starting Windows discovery', async () => {
  const browser = { stop: vi.fn() };
  const bonjour = { destroy: vi.fn(), find: vi.fn((_query, collect) => {
    void Promise.resolve().then(() => collect({ name: 'Mac provider', port: 38642,
      referer: { address: '192.168.0.10' }, txt: { group_id: 'group-a' } }));
    return browser;
  }) };
  const fetchProvider = vi.fn(async () => ({ json: async () => ({ group_id: 'group-a' }), ok: true }));
  await expect(waitForMacosProvider('group-a', 38642, {
    createBonjour: () => bonjour, fetchProvider, timeoutMs: 100
  })).resolves.toMatchObject({ serviceName: 'Mac provider' });
  expect(fetchProvider).toHaveBeenCalledWith(
    'http://192.168.0.10:38642/companion/discovery', expect.any(Object)
  );
  expect(browser.stop).toHaveBeenCalledOnce();
  expect(bonjour.destroy).toHaveBeenCalledOnce();
});

it('uses isolated Mac and Windows Device contracts without legacy pairing or product-data reset', () => {
  const source = fs.readFileSync(
    'scripts/windows/macos-windows-single-principal-sync-group.mjs', 'utf8'
  );
  expect(source).toContain("'single-principal-sync-group'");
  expect(source).toContain('waitForMacosDeviceRequest');
  expect(source).toContain('waitForMacosProvider');
  expect(source).toContain("'.tmp/artifacts/t152-7-windows'");
  expect(source).not.toMatch(/pm.*clear|load_companion_pairing_overview|paired_authorizations/u);
});
