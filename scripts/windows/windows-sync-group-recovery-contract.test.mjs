import fs from 'node:fs';

import { expect, it } from 'vitest';

it('keeps stable desktop A and Windows C on a real LAN Sync Group path', () => {
  const remote = fs.readFileSync('scripts/windows/windows-sync-group-recovery-action.mjs', 'utf8');
  const inspector = fs.readFileSync('scripts/windows/windows-sync-group-recovery-inspect.mjs', 'utf8');
  const ownedClient = fs.readFileSync(
    'scripts/windows/windows-sync-group-owned-client-seed.mjs', 'utf8'
  );
  const control = fs.readFileSync('scripts/windows/windows-sync-group-recovery-control.mjs', 'utf8');
  const runtimeProgress = fs.readFileSync(
    'scripts/windows/windows-sync-group-runtime-progress.mjs', 'utf8'
  );
  const cursorCommit = fs.readFileSync(
    'electron/sync/desktopSyncGroupCursorCommit.ts', 'utf8'
  );
  expect(remote).toContain("FOLIOLE_LIBRARY_HOME: libraryHome");
  expect(remote).toContain("FOLIOLE_ALLOW_PARALLEL_INSTANCE: '1'");
  expect(remote).toContain("windowsAcceptanceRoot(paths), 'client'");
  expect(remote).toContain('provisionWindowsAcceptanceRoot({ paths })');
  expect(remote).toContain('maxRetries: 5, recursive: true, retryDelay: 250');
  expect(remote).toContain("invokeWindowsSyncGroupCommand(session.page, 'request_sync_group_join'");
  expect(remote).toContain('execute, paths, evidenceRoot, factIds, requiredJourneyOrigins');
  expect(remote.indexOf('firstFacts = await waitForOrdinarySyncFacts('))
    .toBeLessThan(remote.indexOf('finally { await closeWindowsSyncGroupSession(session); }'));
  expect(inspector).toContain("missingContentBlobCount");
  expect(inspector).toContain('localMemberState');
  expect(inspector).toContain('departedHosts');
  expect(inspector).toContain('activeHosts');
  expect(inspector).not.toContain("key IN ('device_id', 'desktop_device_id')");
  expect(inspector).toContain(
    'localAuthorizationFingerprint: identity.localMemberAuthorizationFingerprint'
  );
  expect(inspector).toContain('userNodeCount');
  expect(inspector).toContain("members.state = 'left'");
  expect(remote).toContain('initial=${JSON.stringify(initialFacts)}');
  expect(remote).toContain("ELECTRON_RUN_AS_NODE: '1'");
  expect(remote).not.toContain("from 'better-sqlite3'");
  expect(inspector).toContain("from 'better-sqlite3'");
  expect(inspector).toContain('readonly: true');
  expect(inspector).toContain('SELECT authorization_id, stream_name, cursor_value');
  expect(inspector).not.toContain('SELECT peer_id, stream_name, cursor_value');
  expect(remote).toContain('suspendWindowsNativeClient');
  expect(remote).toContain('restoreWindowsNativeClient');
  expect(remote).toContain('else primaryError = cleanupError;');
  expect(remote).toContain('primaryError.message +=');
  expect(remote).toContain("slice(-12).join(' | ')");
  expect(remote).toContain('captureWindowsSyncRuntimeProgress');
  expect(remote).toContain('closeWindowsSyncGroupSession');
  expect(remote).toContain("FOLIOLE_ACCEPTANCE_HOLD_AFTER_SYNC_CURSOR_COMMIT: '1'");
  expect(cursorCommit).toContain("env[ACCEPTANCE_HOLD_AFTER_SYNC_CURSOR_COMMIT] !== '1'");
  expect(runtimeProgress).toContain('captureSyncRuntimeLog(child, logPath');
  expect(runtimeProgress).toContain('RECEIVE_CURSOR_COMMITTED_EVENT');
  expect(remote).toContain("'sync-group-runtime.log'");
  expect(remote).toContain('Ordinary sync pack failed before apply');
  expect(ownedClient).toContain('facts.activeMemberCount < 2');
  expect(ownedClient).toContain('requiredOrigins.some((origin) => !origins.has(origin))');
  expect(remote).toContain('seedOwnedWindowsClient');
  expect(control).not.toContain('runMacosA5SyncGroupApproval');
  expect(`${remote}\n${control}`).not.toContain("'reverse'");
  expect(`${remote}\n${control}`).not.toContain('windows-a5-pair-sync-recovery-action');
});
