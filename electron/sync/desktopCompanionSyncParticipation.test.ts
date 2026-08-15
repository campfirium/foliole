// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({
  enableKey: vi.fn(),
  enabled: true,
  ensure: vi.fn(),
  paused: false,
  stop: vi.fn(),
  workgroupKey: { group_id: 'group-test', group_key: 'secret' } as object | null
}));

vi.mock('./desktopCompanionSyncPreference.js', () => ({
  isDesktopCompanionSyncParticipating: () => runtime.enabled && !runtime.paused,
  setDesktopCompanionSyncEnabled: (enabled: boolean) => { runtime.enabled = enabled; },
  setDesktopCompanionSyncPaused: (paused: boolean) => { runtime.paused = paused; }
}));
vi.mock('./lanWorkspaceSyncServer.js', () => ({
  ensureLanWorkspaceSyncServer: runtime.ensure,
  stopLanWorkspaceSyncServer: runtime.stop
}));
vi.mock('../database/syncGroupStore.js', () => ({
  loadDesktopSyncGroup: () => ({ group_id: 'group-test', local_member_state: 'active' })
}));
vi.mock('./workgroupKeyStore.js', () => ({
  enableDesktopWorkgroupKey: runtime.enableKey,
  loadDesktopWorkgroupKey: () => runtime.workgroupKey
}));

import {
  disableDesktopCompanionSync,
  enableDesktopCompanionSync,
  pauseDesktopCompanionSync,
  reconcileDesktopCompanionSyncRuntime,
  resumeDesktopCompanionSync
} from './desktopCompanionSyncParticipation.js';

const identity = { appVersion: '1.0.0', peerId: 'desktop-a' };

beforeEach(() => {
  vi.clearAllMocks();
  runtime.enabled = true;
  runtime.paused = false;
  runtime.workgroupKey = { group_id: 'group-test', group_key: 'secret' };
  runtime.enableKey.mockImplementation(() => {
    runtime.workgroupKey = { group_id: 'group-test', group_key: 'created' };
  });
});

it('keeps Pause independent when the Sync switch changes', async () => {
  await pauseDesktopCompanionSync();
  await disableDesktopCompanionSync();
  await enableDesktopCompanionSync(identity);

  expect(runtime.enabled).toBe(true);
  expect(runtime.paused).toBe(true);
  expect(runtime.ensure).not.toHaveBeenCalled();
  expect(runtime.stop).toHaveBeenCalledTimes(3);
});

it('resumes the runtime only while Sync remains enabled', async () => {
  runtime.paused = true;
  await resumeDesktopCompanionSync(identity);
  expect(runtime.ensure).toHaveBeenCalledWith(identity);

  runtime.enabled = false;
  runtime.paused = true;
  await resumeDesktopCompanionSync(identity);
  expect(runtime.ensure).toHaveBeenCalledOnce();
  expect(runtime.stop).toHaveBeenCalledOnce();
});

it('keeps an inherited active group offline until formal Enable creates its key', async () => {
  runtime.workgroupKey = null;

  await reconcileDesktopCompanionSyncRuntime(identity);
  expect(runtime.stop).toHaveBeenCalledOnce();
  expect(runtime.enableKey).not.toHaveBeenCalled();

  await enableDesktopCompanionSync(identity);
  expect(runtime.enableKey).toHaveBeenCalledWith('group-test');
  expect(runtime.ensure).toHaveBeenCalledWith(identity);
});
