// @vitest-environment node

import fs from 'node:fs';

import { expect, it } from 'vitest';

it('creates and accepts one equal Device through fixed Windows product commands', () => {
  const source = fs.readFileSync('scripts/windows/windows-two-device-sync-provider-action.mjs', 'utf8');
  expect(source).toContain("'create_sync_group'");
  expect(source).toContain("'accept_sync_group_join_request'");
  expect(source).toContain("'sync_companion_now'");
  expect(source).toContain("JSON.stringify(request).includes('workgroup_key')");
  expect(source).toContain('waitForAutomaticSync(session,');
  expect(source).toContain("waitForWindowsSyncGroupProviderRelease({ action: ACTION");
  expect(source).not.toContain("'discover_sync_groups'");
  expect(source).toContain("'onSyncGroupJoinRequestsChanged' : 'onSyncGroupDiscoveryChanged'");
  expect(source).not.toMatch(/while \(Date\.now\(\) < deadline\)/u);
  expect(source).toContain('automaticResult?.run_id');
  expect(source).toContain("['A', 'B'], { B: 2 }");
  expect(source).not.toMatch(/manager|member|pairing|authorization|DELETE FROM|UPDATE sync_/u);
});
