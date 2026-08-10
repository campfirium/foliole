import fs from 'node:fs';

import { expect, it } from 'vitest';

it('keeps stable desktop A and Windows C on a real LAN Sync Group path', () => {
  const remote = fs.readFileSync('scripts/windows/windows-sync-group-recovery-action.mjs', 'utf8');
  const inspector = fs.readFileSync('scripts/windows/windows-sync-group-recovery-inspect.mjs', 'utf8');
  const control = fs.readFileSync('scripts/windows/windows-sync-group-recovery-control.mjs', 'utf8');
  const provider = fs.readFileSync(
    'android/app/src/main/java/com/foliole/android/FolioleCompanionSyncGroupProvider.java', 'utf8'
  );
  const plugin = fs.readFileSync(
    'android/app/src/main/java/com/foliole/android/FolioleCompanionSyncPlugin.java', 'utf8'
  );
  expect(remote).toContain("FOLIOLE_LIBRARY_HOME: libraryHome");
  expect(remote).toContain("const CLIENT_ROOT_NAME = 'windows-sync-group-client-c'");
  expect(remote).toContain("invokeWindowsSyncGroupCommand(session.page, 'request_sync_group_join'");
  expect(remote).toContain('firstFacts = await waitForOrdinarySyncFacts(execute, paths, evidenceRoot)');
  expect(remote.indexOf('firstFacts = await waitForOrdinarySyncFacts(execute, paths, evidenceRoot)'))
    .toBeLessThan(remote.indexOf('finally { await session.app.close(); }'));
  expect(inspector).toContain("missingContentBlobCount");
  expect(inspector).toContain('localMemberState');
  expect(inspector).toContain('departedDeviceIdentities');
  expect(inspector).toContain('activeDeviceIdentities');
  expect(inspector).toContain('userNodeCount');
  expect(inspector).toContain("members.state = 'left'");
  expect(remote).toContain('initial=${JSON.stringify(initialFacts)}');
  expect(remote).toContain("ELECTRON_RUN_AS_NODE: '1'");
  expect(remote).not.toContain("from 'better-sqlite3'");
  expect(inspector).toContain("from 'better-sqlite3'");
  expect(inspector).toContain('readonly: true');
  expect(remote).toContain("controlWindowsNativeClient(execute, paths, 'stop')");
  expect(remote).toContain("controlWindowsNativeClient(execute, paths, 'start')");
  expect(remote).toContain('else primaryError = cleanupError;');
  expect(remote).toContain('primaryError.message +=');
  expect(remote).toContain("slice(-12).join(' | ')");
  expect(remote).toContain("text.includes('[sync-group]')");
  expect(remote).toContain("'sync-group-runtime.log'");
  expect(remote).toContain('Ordinary sync pack failed before apply');
  expect(remote).toContain('facts.activeMemberCount < 2');
  expect(control).not.toContain('runMacosA5SyncGroupApproval');
  expect(provider).toContain(
    'new FolioleCompanionSyncGroupServer(activeContext, activeConfig, joinRequests, requireDataBridge())'
  );
  expect(provider).toContain('FolioleCompanionSyncGroupJoinGrantStore.save(');
  expect(provider).toContain('promoteApprovedJoin(');
  expect(provider).toContain('if (sameProvider(next))');
  expect(plugin).toMatch(/handleOnDestroy\(\)[\s\S]*?SyncGroupProvider\.pause\(this\)/u);
  expect(`${remote}\n${control}`).not.toContain("'reverse'");
  expect(`${remote}\n${control}`).not.toContain('windows-a5-pair-sync-recovery-action');
});
