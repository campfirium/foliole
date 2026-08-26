// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({
  enabled: true,
  ensure: vi.fn(),
  group: { group_id: 'group-test', local_member_state: 'active' } as object | null,
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
  loadDesktopSyncGroup: () => runtime.group
}));
vi.mock('./workgroupKeyStore.js', () => ({
  loadDesktopWorkgroupKey: () => runtime.workgroupKey
}));

import {
  disableDesktopCompanionSync,
  enableDesktopCompanionSync,
  pauseDesktopCompanionSync,
  reconcileDesktopCompanionSyncRuntime,
  resumeDesktopCompanionSync
} from './desktopCompanionSyncParticipation.js';

const identity = { appVersion: '1.0.0', deviceId: 'desktop-a' };

beforeEach(() => {
  vi.clearAllMocks();
  runtime.enabled = true;
  runtime.group = { group_id: 'group-test', local_member_state: 'active' };
  runtime.paused = false;
  runtime.workgroupKey = { group_id: 'group-test', group_key: 'secret' };
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

it('keeps an active group offline when its required workgroup key is absent', async () => {
  runtime.workgroupKey = null;

  await reconcileDesktopCompanionSyncRuntime(identity);
  expect(runtime.stop).toHaveBeenCalledOnce();
  await enableDesktopCompanionSync(identity);
  expect(runtime.ensure).not.toHaveBeenCalled();
  expect(runtime.stop).toHaveBeenCalledTimes(2);
});

it('allows an ungrouped Host to enable discovery without opening the LAN server', async () => {
  runtime.enabled = false;
  runtime.group = null;

  await enableDesktopCompanionSync(identity);

  expect(runtime.enabled).toBe(true);
  expect(runtime.ensure).not.toHaveBeenCalled();
  expect(runtime.stop).toHaveBeenCalledOnce();
});
