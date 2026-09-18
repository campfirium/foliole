// @vitest-environment node
import { expect, it, vi } from 'vitest';

import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';

const runtime = vi.hoisted(() => ({
  activate: vi.fn(async () => undefined),
  events: [] as string[],
  send: vi.fn()
}));

vi.mock('electron', () => ({ app: { getVersion: () => '0.7.14' } }));
vi.mock('../../lib/platform/syncGroupContract.js', () => ({
  resolveLocalSyncGroupDevice: () => ({ device_identity_key: 'device-local' })
}));
vi.mock('../appVersion.js', () => ({ resolveFolioleAppVersion: () => '0.7.14' }));
vi.mock('../database/connection.js', () => ({
  openDatabaseConnection: vi.fn(),
  runWithDatabaseConnectionOwner: (execute: () => unknown) => execute()
}));
vi.mock('../database/syncGroupMemberStateStore.js', () => ({
  initiateDesktopSyncGroupDeviceRemoval: vi.fn(),
  loadPendingDesktopSyncGroupRemovalDeviceIds: () => []
}));
vi.mock('../database/syncGroupStore.js', () => ({
  createDesktopSyncGroup: vi.fn(),
  leaveDesktopSyncGroupDevice: vi.fn(),
  loadDesktopSyncGroup: () => ({
    devices: [], group_id: 'group-1', local_device_identity_key: 'device-local'
  }),
  newSyncGroupId: vi.fn()
}));
vi.mock('../deviceAnchorStore.js', () => ({ loadDesktopDeviceIdentity: vi.fn() }));
vi.mock('../mainWindowRegistry.js', () => ({
  getMainWindow: () => ({ webContents: { send: runtime.send } })
}));
vi.mock('../sync/companionLanPayloads.js', () => ({
  resolveDesktopHostName: vi.fn(), resolveDesktopPlatformLabel: vi.fn()
}));
vi.mock('../sync/desktopCompanionSyncParticipation.js', () => ({
  activateDesktopCompanionSync: async () => {
    runtime.events.push('runtime-active');
    return runtime.activate();
  },
  assertDesktopCompanionSyncParticipating: vi.fn(),
  disableDesktopCompanionSync: vi.fn(),
  enableDesktopCompanionSync: vi.fn(),
  pauseDesktopCompanionSync: vi.fn(),
  resumeDesktopCompanionSync: vi.fn()
}));
vi.mock('../sync/desktopCompanionSyncPreference.js', () => ({
  loadDesktopCompanionSyncParticipation: () => ({ enabled: true, paused: false })
}));
vi.mock('../sync/desktopSyncGroupAutoSync.js', () => ({ runDesktopManualSyncWithDiscovery: vi.fn() }));
vi.mock('../sync/desktopSyncGroupDiscoverySession.js', () => ({
  DesktopSyncGroupDiscoverySession: class {
    start() { return undefined; }
    stop() { return undefined; }
  }
}));
vi.mock('../sync/desktopSyncGroupJoin.js', () => ({
  completeDesktopSyncGroupJoin: async (options: { onMembershipCommitted(): Promise<void> }) => {
    runtime.events.push('membership-committed');
    await options.onMembershipCommitted();
    runtime.events.push('join-returned');
  },
  requestDesktopSyncGroupJoin: vi.fn()
}));
vi.mock('../sync/desktopSyncGroupJoinProvider.js', () => ({
  loadDesktopSyncGroupJoinProvider: () => null
}));
vi.mock('../sync/desktopSyncGroupJoinState.js', () => ({
  loadDesktopSyncGroupJoinState: () => ({ candidates: [], pending: null }),
  saveDesktopSyncGroupCandidates: vi.fn()
}));
vi.mock('../sync/desktopSyncGroupMemberStateSession.js', () => ({
  exchangeAllDesktopSyncGroupMemberStates: vi.fn(), publishDesktopSyncGroupDeparture: vi.fn()
}));
vi.mock('../sync/desktopSyncGroupRoutes.js', () => ({ removeDesktopSyncGroupRoute: vi.fn() }));
vi.mock('../sync/lanWorkspaceSyncServer.js', () => ({
  getLanWorkspaceSyncServerStatus: () => ({ state: 'running' }),
  stopLanWorkspaceSyncServer: vi.fn()
}));

import { handleSyncGroupCommand } from './syncGroupCommands.js';

it('activates the member runtime before a committed join returns to the renderer', async () => {
  await handleSyncGroupCommand(NATIVE_COMMANDS.completeSyncGroupJoin, {});

  expect(runtime.events).toEqual(['membership-committed', 'runtime-active', 'join-returned']);
  expect(runtime.activate).toHaveBeenCalledOnce();
  expect(runtime.send).toHaveBeenCalledOnce();
});
