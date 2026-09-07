// @vitest-environment node

import fs from 'node:fs';

import { expect, it } from 'vitest';

it('uses isolated Mac and Windows Device contracts without legacy pairing or product-data reset', () => {
  const source = fs.readFileSync(
    'scripts/windows/macos-windows-single-principal-sync-group.mjs', 'utf8'
  );
  expect(source).toContain("'single-principal-sync-group'");
  expect(source).toContain('waitForMacosDeviceRequest');
  expect(source).toContain("'.tmp/artifacts/t152-7-windows'");
  expect(source).toContain('FOLIOLE_T152_ACCEPTANCE_ROOT');
  expect(source).toContain("creator === 'windows'");
  expect(source).toContain("action: 'single-principal-sync-group'");
  expect(source).toContain("windowsProvider.waitForProgress('restarted')");
  expect(source).toContain("windowsProvider.release('consumer_complete')");
  expect(source).toContain("device: 'A'");
  expect(source).toContain("waitForOriginCount(session, 'C', 2)");
  expect(source).toContain("session.invoke('sync_companion_now')");
  expect(source.indexOf("windowsProvider.release('consumer_complete')"))
    .toBeLessThan(source.indexOf("session.invoke('sync_companion_now')"));
  expect(source).toContain("waitForProgress('conflict-fork-ready')");
  expect(source).not.toMatch(/pm.*clear|load_companion_pairing_overview|paired_authorizations/u);
  expect(source).not.toMatch(/bonjour-service|new Bonjour|\/companion\/discovery|endpointUrl/u);
});

it('keeps the reverse desktop role on the same fixed Windows provider control plane', () => {
  const source = fs.readFileSync('scripts/windows/macos-joins-windows-sync-group.mjs', 'utf8');
  expect(source).toContain("action: 'two-device-sync-provider'");
  expect(source.indexOf("session.invoke('enable_companion_sync')"))
    .toBeLessThan(source.indexOf("session.invoke('request_sync_group_join'"));
  expect(source).toContain("session.invoke('request_sync_group_join'");
  expect(source).toContain("session.invoke('complete_sync_group_join')");
  expect(source).toContain("device: 'B'");
  expect(source).toContain("provider.release('consumer_complete')");
  expect(source).toContain("session.invoke('sync_companion_now')");
  expect(source).not.toMatch(/pm.*clear|workgroup_key\s*:/u);
});
