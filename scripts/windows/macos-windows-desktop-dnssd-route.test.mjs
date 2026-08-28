// @vitest-environment node

import fs from 'node:fs';

import { expect, it } from 'vitest';

it('runs two independent route-only Mac and Windows restart attempts', () => {
  const source = fs.readFileSync(
    'scripts/windows/macos-windows-desktop-dnssd-route.mjs', 'utf8'
  );
  expect(source).toContain("action: 'desktop-dnssd-route-provider'");
  expect(source).toContain("label: 'initial'");
  expect(source).toContain("label: 'restarted'");
  expect(source).toContain('index < 2');
  expect(source).toContain("'.tmp/artifacts/t152-11-desktop-dnssd'");
  expect(source).toContain('productRevision: PRODUCT_REVISION');
  expect(source).not.toMatch(/bonjour-service|multicast-dns|discover_sync_groups/u);
  expect(source).not.toMatch(/create_sync_group|request_sync_group_join|accept_sync_group/u);
  expect(source).not.toMatch(/sync_companion_now|endpoint_url|ipv4_addresses/u);
});

it('keeps the Windows provider on the existing short-lived action lifecycle', () => {
  const source = fs.readFileSync('scripts/windows/windows-desktop-dnssd-route-action.mjs', 'utf8');
  expect(source).toContain('waitForWindowsSyncGroupProviderRelease');
  expect(source).toContain('waitForDesktopRoute');
  expect(source).toContain("factId: 'desktop-dnssd-route'");
  expect(source).not.toMatch(/create_sync_group|request_sync_group_join|sync_companion_now/u);
  expect(source).not.toMatch(/endpoint_url|bonjour-service|multicast-dns/u);
});
