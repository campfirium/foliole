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
  expect(source).not.toMatch(/pm.*clear|load_companion_pairing_overview|paired_authorizations/u);
});
