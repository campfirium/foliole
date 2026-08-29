// @vitest-environment node

import fs from 'node:fs';
import { expect, it } from 'vitest';

it('uses a fresh task-owned client and stops after exact product discovery', () => {
  const source = fs.readFileSync(
    'scripts/windows/windows-desktop-dnssd-find-diagnostic-action.mjs', 'utf8'
  );
  expect(source).toContain('windowsSyncGroupClientPaths');
  expect(source).toContain('fs.rmSync(path.dirname(client.libraryHome)');
  expect(source).toContain("triggerCommand: 'discover_sync_groups'");
  expect(source).toContain("kind: 'candidate-identity'");
  expect(source).toContain('matches.length !== 1');
  expect(source).toContain('requestSent: false');
  expect(source).not.toContain('request_sync_group_join');
  expect(source).not.toContain('complete_sync_group_join');
  expect(source).not.toContain('sync_companion_now');
});

it('binds the Mac driver to one new attempt and the exact created identity', () => {
  const source = fs.readFileSync(
    'scripts/windows/macos-windows-desktop-dnssd-diagnostic.mjs', 'utf8'
  );
  expect(source).toContain('const attemptId = randomUUID()');
  expect(source).toContain("action: 'desktop-dnssd-find-diagnostic'");
  expect(source).toContain('expectedGroupId: groupId, expectedGroupTag: groupTag');
  expect(source).toContain('windows.receipt.requestSent !== false');
  expect(source).not.toContain('--resume');
  expect(source).not.toContain('request_sync_group_join');
});
