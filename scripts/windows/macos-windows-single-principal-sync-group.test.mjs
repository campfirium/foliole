// @vitest-environment node

import fs from 'node:fs';

import { expect, it, vi } from 'vitest';

import { waitForMacosProvider } from './macos-windows-single-principal-sync-group.mjs';

it('waits for the exact reachable Mac provider before starting Windows discovery', async () => {
  const browser = { stop: vi.fn() };
  const bonjour = { destroy: vi.fn(), find: vi.fn((_query, collect) => {
    void Promise.resolve().then(() => collect({ name: 'Mac provider', port: 38642,
      addresses: ['192.168.0.10'], referer: { address: '169.254.161.89' },
      txt: { group_id: 'group-a', ipv4_addresses: '192.168.0.10,198.18.0.1' } }));
    return browser;
  }) };
  const fetchProvider = vi.fn(async (url) => url.includes('192.168.0.10')
    ? { json: async () => ({ group_id: 'group-a' }), ok: true }
    : Promise.reject(new Error('unreachable route')));
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
  expect(source).toContain('FOLIOLE_T152_ACCEPTANCE_ROOT');
  expect(source).toContain("device: 'A'");
  expect(source).toContain("waitForOriginCount(session, 'C', 2)");
  expect(source).toContain("session.invoke('sync_companion_now')");
  expect(source).not.toMatch(/pm.*clear|load_companion_pairing_overview|paired_authorizations/u);
});
