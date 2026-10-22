import { vi } from 'vitest';

const runtime = vi.hoisted(() => ({
  coordinator: vi.fn(async () => ({ status: 'completed' })),
  recordNoPeer: vi.fn(async () => undefined),
  discovery: vi.fn(),
  freshness: vi.fn(),
  memberEndpoints: [] as Array<Record<string, unknown>>,
  memberSessionArgs: null as null | {
    onChanged(): void;
    onMember(peer: Record<string, unknown>, isCurrent?: () => boolean): Promise<boolean>;
    onMemberLost(deviceId: string): void;
    onDiscoveryState(error: Error | null): void;
  },
  notifyOverviewChanged: vi.fn(),
  recoverTopology: vi.fn(),
  recoverMembers: vi.fn(),
  recoverAdvertisement: vi.fn(),
  readwiseContinue: vi.fn(async () => null),
  syncCompleted: null as null | (() => void),
  refreshUpstream: vi.fn(async () => undefined),
  assertOwner: () => {},
  requireOwner: false,
  group: {
    devices: [
      { device_identity_key: 'desktop-a', device_name: 'Mac', platform: 'darwin', state: 'active' },
      { device_identity_key: 'desktop-b', device_name: 'Windows', platform: 'win32', state: 'active' }
    ],
    group_id: 'group-1', local_device_identity_key: 'desktop-a'
  },
  participating: true,
  persistedRoute: null as null | Record<string, unknown>,
  role: 'observing',
  sessionArgs: null as null | Record<string, (...args: never[]) => unknown>,
  stop: vi.fn(),
  updateRole: vi.fn(async () => undefined)
}));

export function getRuntime() { return runtime; }

vi.mock('./desktopSyncActivityStore.js', () => ({ recordDesktopSyncNoPeer: runtime.recordNoPeer }));

vi.mock('../database/connection.js', async () => {
  const { SqliteConnectionCoordinator } = await import('../database/sqliteConnectionCoordinator.js');
  const coordinator = new SqliteConnectionCoordinator();
  runtime.assertOwner = () => coordinator.assertAccess();
  runtime.readwiseContinue.mockImplementation(() => coordinator.runExclusive(() => null));
  return { registerDatabaseConnectionCleanup: vi.fn(), runWithDatabaseConnectionOwner: <T>(execute: () => Promise<T> | T) => coordinator.runExclusive(execute) };
});
vi.mock('../database/syncGroupStore.js', () => ({ loadDesktopSyncGroup: () => {
  if (runtime.requireOwner) runtime.assertOwner();
  return runtime.group;
} }));
vi.mock('../database/syncGroupMemberStateStore.js', () => ({
  isDesktopSyncGroupDeviceBlocked: () => false
}));
vi.mock('../database/watchedFolderConflictDecisions.js', () => ({
  loadUnreconciledWatchedFolderConflictDecisions: () => []
}));
vi.mock('../database/settingsStore.js', () => ({
  loadJsonSetting: () => runtime.persistedRoute,
  saveJsonSetting: (_key: string, value: null | Record<string, unknown>) => {
    runtime.persistedRoute = value;
  }
}));
vi.mock('./desktopCompanionSyncPreference.js', () => ({
  isDesktopCompanionSyncParticipating: () => {
    if (runtime.requireOwner) runtime.assertOwner();
    return runtime.participating;
  }
}));
vi.mock('./companionMdnsAdvertisement.js', () => ({
  recoverCompanionMdnsAdvertisement: runtime.recoverAdvertisement
}));
const completedListeners = vi.hoisted(() => new Set<() => void>());
vi.mock('./desktopMemberSyncCadence.js', () => ({ updateDesktopSyncFreshness: runtime.freshness }));
vi.mock('./desktopSyncCoordinator.js', () => ({ runDesktopSyncCoordinator: runtime.coordinator,
  subscribeDesktopSyncCompleted: (callback: () => void) => {
    completedListeners.add(callback);
    runtime.syncCompleted = () => { for (const listener of completedListeners) listener(); };
    return () => { completedListeners.delete(callback); };
  } }));
vi.mock('./desktopUpstreamSession.js', () => ({
  closeDesktopUpstreamSession: vi.fn(), refreshDesktopUpstreamSession: runtime.refreshUpstream
}));
vi.mock('./desktopForegroundPresenceRuntime.js', () => ({ installDesktopForegroundPresence: vi.fn() }));
vi.mock('./desktopSyncGroupDiscovery.js', () => ({ discoverDesktopSyncGroups: runtime.discovery }));
vi.mock('./desktopSyncGroupOverviewNotifier.js', () => ({
  notifyDesktopSyncGroupOverviewChanged: runtime.notifyOverviewChanged
}));
vi.mock('./desktopSyncGroupMemberStateSession.js', () => ({
  exchangeAllDesktopSyncGroupMemberStates: vi.fn(async () => false),
  loadDesktopSyncGroupMemberEndpoints: () => runtime.memberEndpoints,
  startDesktopSyncGroupMemberStateSession: (_group: unknown, onChanged: () => void,
    onMember: (peer: Record<string, unknown>, isCurrent: () => boolean) => Promise<boolean>,
    onMemberLost: (deviceId: string) => void, onDiscoveryState: (error: Error | null) => void) => {
    runtime.memberSessionArgs = { onChanged, onMember: (peer, isCurrent = () => true) => onMember(peer, isCurrent),
      onMemberLost, onDiscoveryState };
    return { recover: runtime.recoverMembers, stop: vi.fn() };
  }
}));
vi.mock('./readwiseOwnerHandoff.js', () => ({
  continuePendingReadwiseHandoff: runtime.readwiseContinue
}));
