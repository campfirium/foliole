import fs from 'node:fs';

import { expect, it } from 'vitest';

it('keeps A5 on Mac and Windows C on a real LAN Sync Group path', () => {
  const remote = fs.readFileSync('scripts/windows/windows-sync-group-recovery-action.mjs', 'utf8');
  const inspector = fs.readFileSync('scripts/windows/windows-sync-group-recovery-inspect.mjs', 'utf8');
  const control = fs.readFileSync('scripts/windows/windows-sync-group-recovery-control.mjs', 'utf8');
  const approval = fs.readFileSync('scripts/android/macos-a5-sync-group-approval.mjs', 'utf8');
  const approvalScenario = fs.readFileSync(
    'android/app/src/androidTest/java/com/foliole/android/FolioleCompanionSyncGroupApprovalScenario.java', 'utf8'
  );
  const provider = fs.readFileSync(
    'android/app/src/main/java/com/foliole/android/FolioleCompanionSyncGroupProvider.java', 'utf8'
  );
  const plugin = fs.readFileSync(
    'android/app/src/main/java/com/foliole/android/FolioleCompanionSyncPlugin.java', 'utf8'
  );
  expect(remote).toContain("FOLIOLE_LIBRARY_HOME: libraryHome");
  expect(remote).toContain("invoke(session.page, 'request_sync_group_join'");
  expect(remote).toContain('firstFacts = await waitForOrdinarySyncFacts(execute, paths, evidenceRoot)');
  expect(remote.indexOf('firstFacts = await waitForOrdinarySyncFacts(execute, paths, evidenceRoot)'))
    .toBeLessThan(remote.indexOf('finally { await session.app.close(); }'));
  expect(inspector).toContain("missingContentBlobCount");
  expect(remote).toContain("ELECTRON_RUN_AS_NODE: '1'");
  expect(remote).not.toContain("from 'better-sqlite3'");
  expect(inspector).toContain("from 'better-sqlite3'");
  expect(inspector).toContain('readonly: true');
  expect(remote).toContain("controlNativeClient(execute, paths, 'stop')");
  expect(remote).toContain("controlNativeClient(execute, paths, 'start')");
  expect(control).toContain('runMacosA5SyncGroupApproval');
  expect(approval).toContain('FolioleCompanionSyncGroupApprovalTest');
  expect(approvalScenario).toContain('leaveProviderRunning = true');
  expect(provider).toContain('new FolioleCompanionSyncGroupServer(activeContext, activeConfig, joinRequests)');
  expect(provider).toContain('FolioleCompanionSyncGroupDatabase.registerMember(');
  expect(provider).toContain('if (sameProvider(next))');
  expect(plugin).toMatch(/handleOnDestroy\(\)[\s\S]*?SyncGroupProvider\.pause\(\)/u);
  expect(`${remote}\n${control}\n${approval}`).not.toContain("'reverse'");
  expect(`${remote}\n${control}\n${approval}`).not.toContain('windows-a5-pair-sync-recovery-action');
});
