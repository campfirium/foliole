// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({
  enabled: true,
  ensure: vi.fn(),
  paused: false,
  stop: vi.fn()
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

import {
  disableDesktopCompanionSync,
  enableDesktopCompanionSync,
  pauseDesktopCompanionSync,
  resumeDesktopCompanionSync
} from './desktopCompanionSyncParticipation.js';

const identity = { appVersion: '1.0.0', peerId: 'desktop-a' };

beforeEach(() => {
  vi.clearAllMocks();
  runtime.enabled = true;
  runtime.paused = false;
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
