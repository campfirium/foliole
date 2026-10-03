// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';

import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';

const runtime = vi.hoisted(() => ({
  activate: vi.fn(async (): Promise<void> => undefined),
  enable: vi.fn(async (): Promise<void> => undefined),
  disable: vi.fn(async (): Promise<void> => undefined),
  pause: vi.fn(async (): Promise<void> => undefined),
  resume: vi.fn(async (): Promise<void> => undefined),
  diagnostics: vi.fn(),
  permission: vi.fn(async () => true),
  read: async (execute: () => unknown) => execute(),
  events: [] as string[],
  send: vi.fn()
}));

vi.mock('electron', () => ({ app: { getVersion: () => '0.7.14' } }));
vi.mock('../../lib/platform/syncGroupContract.js', () => ({
  resolveLocalSyncGroupDevice: () => ({ device_identity_key: 'device-local' })
}));
vi.mock('../appVersion.js', () => ({ resolveFolioleAppVersion: () => '0.7.14' }));
vi.mock('../database/backupRestorePendingSync.js', () => ({ loadBackupRestorePendingSync: () => null }));
vi.mock('../database/connection.js', async () => {
  const { SqliteConnectionCoordinator } = await import('../database/sqliteConnectionCoordinator.js');
  const coordinator = new SqliteConnectionCoordinator();
  runtime.read = execute => coordinator.runExclusive(execute);
  return { openDatabaseConnection: vi.fn(), runWithDatabaseConnectionOwner: runtime.read };
});
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
vi.mock('../database/watchedFolderConflictDecisions.js', () => ({
  loadPendingWatchedFolderConflicts: () => [],
  saveWatchedFolderConflictDecision: vi.fn()
}));
vi.mock('../deviceAnchorStore.js', () => ({ loadDesktopDeviceIdentity: vi.fn() }));
vi.mock('../mainWindowRegistry.js', () => ({
  getMainWindow: () => ({ webContents: { send: runtime.send } })
}));
vi.mock('../sync/companionLanPayloads.js', () => ({
  resolveDesktopHostName: vi.fn(), resolveDesktopPlatformLabel: vi.fn()
}));
vi.mock('../sync/buildDesktopSyncDiagnostics.js', () => ({ buildDesktopSyncDiagnostics: runtime.diagnostics }));
vi.mock('../sync/desktopCompanionSyncParticipation.js', () => ({
  activateDesktopCompanionSync: async () => {
    runtime.events.push('runtime-active');
    return runtime.activate();
  },
  assertDesktopCompanionSyncParticipating: vi.fn(),
  disableDesktopCompanionSync: runtime.disable,
  enableDesktopCompanionSync: runtime.enable,
  pauseDesktopCompanionSync: runtime.pause,
  resumeDesktopCompanionSync: runtime.resume
}));
vi.mock('../sync/desktopCompanionSyncPreference.js', () => ({
  loadDesktopCompanionSyncParticipation: () => ({ sync_enabled: true, sync_paused: false, participating: true })
}));
vi.mock('../sync/desktopSyncGroupAutoSync.js', () => ({
  resumeDesktopSyncAfterWatchedDecision: vi.fn(async (): Promise<void> => undefined),
  runDesktopManualSyncWithDiscovery: vi.fn()
}));
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
  exchangeAllDesktopSyncGroupMemberStates: vi.fn(), publishDesktopSyncGroupDeparture: vi.fn(),
  publishWatchedFolderGroupMemberState: vi.fn()
}));
vi.mock('../sync/desktopSyncGroupRoutes.js', () => ({ removeDesktopSyncGroupRoute: vi.fn() }));
vi.mock('../sync/lanWorkspaceSyncServer.js', () => ({
  getLanWorkspaceSyncServerStatus: () => ({ state: 'running' }),
  stopLanWorkspaceSyncServer: vi.fn()
}));
vi.mock('../sync/windowsSyncNetworkPermission.js', () => ({
  ensureWindowsSyncNetworkPermission: runtime.permission
}));

import { handleSyncGroupCommand } from './syncGroupCommands.js';

beforeEach(() => {
  runtime.activate.mockClear();
  runtime.enable.mockClear();
  runtime.disable.mockClear();
  runtime.pause.mockClear();
  runtime.resume.mockClear();
  runtime.permission.mockClear();
  runtime.send.mockClear();
  runtime.events.length = 0;
  runtime.diagnostics.mockReset();
});

it('loads the diagnostic contract without enabling sync or requesting permission', async () => {
  const payload = { activity: [], active_run_ids: [], active_run: false, report_text: '{}' };
  runtime.diagnostics.mockReturnValue(payload);
  expect(await handleSyncGroupCommand(NATIVE_COMMANDS.loadDesktopSyncDiagnostics, {})).toBe(payload);
  expect(runtime.diagnostics).toHaveBeenCalledWith(expect.objectContaining({ sync_enabled: true }), '0.7.14');
  expect(runtime.enable).not.toHaveBeenCalled();
  expect(runtime.permission).not.toHaveBeenCalled();
});

it('propagates diagnostic read failures instead of returning an empty success', async () => {
  runtime.diagnostics.mockImplementation(() => { throw new Error('diagnostic_read_failed'); });
  await expect(handleSyncGroupCommand(NATIVE_COMMANDS.loadDesktopSyncDiagnostics, {}))
    .rejects.toThrow('diagnostic_read_failed');
});

it('activates the member runtime before a committed join returns to the renderer', async () => {
  await handleSyncGroupCommand(NATIVE_COMMANDS.completeSyncGroupJoin, {});

  expect(runtime.events).toEqual(['membership-committed', 'runtime-active', 'join-returned']);
  expect(runtime.activate).toHaveBeenCalledOnce();
  expect(runtime.send).toHaveBeenCalledOnce();
});

it('checks network permission when Sync is switched on and does not enable after cancellation', async () => {
  runtime.permission.mockResolvedValueOnce(false);
  await handleSyncGroupCommand(NATIVE_COMMANDS.enableCompanionSync, {});
  expect(runtime.permission).toHaveBeenCalledOnce();
  expect(runtime.enable).not.toHaveBeenCalled();

  await handleSyncGroupCommand(NATIVE_COMMANDS.enableCompanionSync, {});
  expect(runtime.enable).toHaveBeenCalledOnce();
});

it('Sync Now never triggers the permission request', async () => {
  const calls = runtime.permission.mock.calls.length;
  await handleSyncGroupCommand(NATIVE_COMMANDS.syncCompanionNow, {});
  expect(runtime.permission).toHaveBeenCalledTimes(calls);
});

it.each([
  [NATIVE_COMMANDS.enableCompanionSync, 'enable'],
  [NATIVE_COMMANDS.resumeCompanionSync, 'resume'],
  [NATIVE_COMMANDS.disableCompanionSync, 'disable'],
  [NATIVE_COMMANDS.pauseCompanionSync, 'pause']
] as const)('keeps database reads available while %s waits for OS network work', async (command, method) => {
  let release = () => {};
  runtime[method].mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; }));
  const starting = handleSyncGroupCommand(command, {});
  await vi.waitFor(() => expect(runtime[method]).toHaveBeenCalledOnce());
  let readCompleted = false;
  const read = runtime.read(() => { readCompleted = true; });
  try {
    await new Promise<void>(resolve => setImmediate(resolve));
    expect(readCompleted).toBe(true);
  } finally {
    release();
    await starting;
    await read;
  }
});
