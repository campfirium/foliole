// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  inspect: vi.fn(), invoke: vi.fn(), open: vi.fn(), release: vi.fn(async () => ({})),
  restore: vi.fn(async () => undefined), suspend: vi.fn(async () => false)
}));

vi.mock('./windows-sync-group-recovery-action.mjs', () => ({
  controlWindowsNativeClient: vi.fn(), inspectWindowsSyncGroupDatabase: mocks.inspect,
  invokeWindowsSyncGroupCommand: mocks.invoke, openWindowsSyncGroupSession: mocks.open
}));
vi.mock('./windows-sync-group-native-lifecycle.mjs', () => ({
  restoreWindowsNativeClient: mocks.restore, suspendWindowsNativeClient: mocks.suspend
}));
vi.mock('./windows-sync-group-provider-release.mjs', () => ({
  waitForWindowsSyncGroupProviderRelease: mocks.release
}));

import {
  runWindowsMultiDeviceSyncParticipation
} from './windows-multi-device-sync-participation-action.mjs';

function facts(overrides = {}) {
  return { activeMemberCount: 3, attachmentCount: 1, contentBlobCount: 2,
    integrity: 'ok', journeyFacts: {}, localGroupId: 'group-1', localMemberState: 'active',
    missingAttachmentCount: 0, missingContentBlobCount: 0, syncDeliveryReceiptCount: 2,
    syncPeerCursorCount: 2, userNodeCount: 3, ...overrides };
}

function overview(enabled, paused, group = true) {
  return { paired_devices: [], participating: enabled && !paused, sync_enabled: enabled,
    sync_group: group ? { group_id: 'group-1', local_member_state: 'active' } : null,
    sync_paused: paused };
}

it('persists independent controls, catches up, and leaves as the last member', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'windows-participation-'));
  const pages = Array.from({ length: 4 }, () => ({}));
  mocks.open.mockImplementation(async () => ({ app: { close: vi.fn(async () => undefined) },
    page: pages.shift() }));
  mocks.inspect.mockResolvedValueOnce(facts())
    .mockResolvedValueOnce(facts({ journeyFacts: { 'fact-a': 'A' }, userNodeCount: 4 }))
    .mockResolvedValueOnce(facts({ activeMemberCount: 1, userNodeCount: 4 }))
    .mockResolvedValueOnce(facts({ activeMemberCount: 1, userNodeCount: 4 }))
    .mockResolvedValueOnce(facts({ activeMemberCount: 0, localGroupId: null,
      localMemberState: null, syncDeliveryReceiptCount: 0, syncPeerCursorCount: 0,
      userNodeCount: 4 }));
  const loads = [overview(true, true), overview(false, false), overview(false, false, false)];
  mocks.invoke.mockImplementation(async (_page, command) => {
    if (command === 'load_companion_pairing_overview') return loads.shift();
    if (command === 'pause_companion_sync') return overview(true, true);
    if (command === 'resume_companion_sync' || command === 'enable_companion_sync') {
      return overview(true, false);
    }
    if (command === 'disable_companion_sync') return overview(false, false);
    if (command === 'leave_sync_group') return overview(false, false, false);
    throw new Error(`unexpected command ${command}`);
  });
  const reportProgress = vi.fn();
  const result = await runWindowsMultiDeviceSyncParticipation({ evidenceRoot: root,
    execute: vi.fn(), paths: { repoRoot: root }, reportProgress });
  expect(result.multiDeviceSyncParticipation.manifestPath)
    .toBe(path.join(root, 'multi-device-sync-participation-receipt.json'));
  expect(reportProgress).toHaveBeenCalledWith({
    factId: 'participation-control', milestone: 'windows-paused'
  });
  expect(mocks.release).toHaveBeenCalledWith(expect.objectContaining({
    action: 'multi-device-sync-participation'
  }));
  expect(JSON.parse(fs.readFileSync(result.multiDeviceSyncParticipation.manifestPath, 'utf8')))
    .toMatchObject({ resultStatus: 'success' });
  fs.rmSync(root, { force: true, recursive: true });
});
