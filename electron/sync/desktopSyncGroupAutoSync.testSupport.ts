import { vi } from 'vitest';

const runtime = vi.hoisted(() => ({
  coordinator: vi.fn(async () => ({ status: 'completed' })),
  recordNoPeer: vi.fn(async () => undefined),
  discovery: vi.fn(),
  freshness: vi.fn(),
  memberEndpoints: [] as Array<Record<string, unknown>>,
  memberSessionArgs: null as null | {
    onChanged(): void;
    onMember(peer: Record<string, unknown>): Promise<boolean>;
    onMemberLost(deviceId: string): void;
  },
  notifyOverviewChanged: vi.fn(),
  recoverTopology: vi.fn(),
  recoverMembers: vi.fn(),
  recoverAdvertisement: vi.fn(),
  readwiseContinue: vi.fn(async () => null),
  syncCompleted: null as null | (() => void),
  owned: false,
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

vi.mock('../database/connection.js', () => ({
  runWithDatabaseConnectionOwner: async <T>(execute: () => Promise<T> | T) => {
    runtime.owned = true;
    try { return await execute(); } finally { runtime.owned = false; }
  }
}));
vi.mock('../database/syncGroupStore.js', () => ({ loadDesktopSyncGroup: () => {
  if (runtime.requireOwner && !runtime.owned) throw new Error('sqlite owner required');
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
vi.mock('./desktopAnchorTopologyRole.js', () => ({
  loadDesktopAnchorTopologyState: () => ({ role: runtime.role })
}));
vi.mock('./desktopAnchorTopologySession.js', () => ({
  startDesktopAnchorTopologySession: (args: typeof runtime.sessionArgs) => {
    runtime.sessionArgs = args;
    return { recoverDiscovery: runtime.recoverTopology, stop: runtime.stop };
  }
}));
vi.mock('./desktopCompanionSyncPreference.js', () => ({
  isDesktopCompanionSyncParticipating: () => runtime.participating
}));
vi.mock('./companionMdnsAdvertisement.js', () => ({
  recoverCompanionMdnsAdvertisement: runtime.recoverAdvertisement,
  updateCompanionMdnsAdvertisementRole: runtime.updateRole
}));
vi.mock('./desktopMemberSyncCadence.js', () => ({ updateDesktopSyncFreshness: runtime.freshness }));
vi.mock('./desktopSyncCoordinator.js', () => ({ runDesktopSyncCoordinator: runtime.coordinator,
  subscribeDesktopSyncCompleted: (callback: () => void) => {
    runtime.syncCompleted = callback;
    return () => { runtime.syncCompleted = null; };
  } }));
vi.mock('./desktopSyncGroupDiscovery.js', () => ({ discoverDesktopSyncGroups: runtime.discovery }));
vi.mock('./desktopSyncGroupOverviewNotifier.js', () => ({
  notifyDesktopSyncGroupOverviewChanged: runtime.notifyOverviewChanged
}));
vi.mock('./desktopSyncGroupMemberStateSession.js', () => ({
  exchangeAllDesktopSyncGroupMemberStates: vi.fn(async () => false),
  loadDesktopSyncGroupMemberEndpoints: () => runtime.memberEndpoints,
  startDesktopSyncGroupMemberStateSession: (_group: unknown, onChanged: () => void,
    onMember: (peer: Record<string, unknown>) => Promise<boolean>,
    onMemberLost: (deviceId: string) => void) => {
    runtime.memberSessionArgs = { onChanged, onMember, onMemberLost };
    return { recover: runtime.recoverMembers, stop: vi.fn() };
  }
}));
vi.mock('./readwiseOwnerHandoff.js', () => ({
  continuePendingReadwiseHandoff: runtime.readwiseContinue
}));
