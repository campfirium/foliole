import fs from 'node:fs';

import { expect, it } from 'vitest';

it('keeps A5 on Mac and Windows C on a real LAN Sync Group path', () => {
  const remote = fs.readFileSync('scripts/windows/windows-sync-group-recovery-action.mjs', 'utf8');
  const control = fs.readFileSync('scripts/windows/windows-sync-group-recovery-control.mjs', 'utf8');
  const approval = fs.readFileSync('scripts/android/macos-a5-sync-group-approval.mjs', 'utf8');
  expect(remote).toContain("FOLIOLE_LIBRARY_HOME: libraryHome");
  expect(remote).toContain("invoke(session.page, 'request_sync_group_join'");
  expect(remote).toContain("missingContentBlobCount");
  expect(control).toContain('runMacosA5SyncGroupApproval');
  expect(approval).toContain('FolioleCompanionSyncGroupApprovalTest');
  expect(`${remote}\n${control}\n${approval}`).not.toContain("'reverse'");
  expect(`${remote}\n${control}\n${approval}`).not.toContain('windows-a5-pair-sync-recovery-action');
});
