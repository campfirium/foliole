// @vitest-environment node

import fs from 'node:fs';
import { expect, it } from 'vitest';

it('keeps formal discovery on product sessions with short canonical libraries', () => {
  const source = fs.readFileSync(
    'scripts/windows/macos-windows-desktop-dnssd-acceptance.mjs', 'utf8'
  );
  expect(source).toContain('createT152DesktopDnsSdLibrary');
  expect(source).toContain('loadDnsSdIdentityPreflight');
  expect(source).toContain("action: 'desktop-dnssd-find-acceptance'");
  expect(source).toContain("action: 'desktop-dnssd-advertise-acceptance'");
  expect(source).toContain("triggerCommand: 'discover_sync_groups'");
  expect(source).toContain("session.invoke('stop_discover_sync_groups')");
  expect(source).not.toContain('request_sync_group_join');
  expect(source).not.toContain('dns-sd');
  expect(source).not.toContain('--resume');
});
