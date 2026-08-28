import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const useCompanionBootstrap = vi.fn();
const useCompanionWorkspaceSync = vi.fn();
const syncGroupStore = vi.hoisted(() => ({
  loadCompanionSyncGroup: vi.fn(async () => null)
}));
const syncGroupProvider = vi.hoisted(() => ({
  loadCompanionSyncGroupProviderState: vi.fn(async () => ({
    pending_requests: [],
    sync_enabled: true,
    sync_paused: false
  })),
  reconcileCompanionSyncGroupProvider: vi.fn(async () => undefined),
  setCompanionSyncEnabled: vi.fn(async () => undefined),
  setCompanionSyncPaused: vi.fn(async () => undefined)
}));

vi.setConfig({ testTimeout: 30_000 });

vi.mock('./useCompanionBootstrap', () => ({
  useCompanionBootstrap
}));

vi.mock('./useCompanionWorkspaceSync', () => ({
  useCompanionWorkspaceSync
}));

vi.mock('../shared/platform/companion/sync/syncGroupProvider', () => syncGroupProvider);
vi.mock('../shared/platform/companion/sync/syncGroupStore', () => syncGroupStore);
vi.mock('../shared/platform/companionWorkspaceRuntimeRepository', async (importOriginal) => ({
  ...await importOriginal<typeof import('../shared/platform/companionWorkspaceRuntimeRepository')>(),
  isNativeCompanionSyncGroupRuntime: () => false,
  isNativeCompanionSyncGroupStoreRuntime: () => true,
  isNativeCompanionSyncParticipationRuntime: () => true
}));

vi.mock('@/features/pdf/components/SimplePdfDocument', () => ({
  SimplePdfDocument: () => <div>PDF original viewer</div>
}));

function mockCompanionWorkspaceSync(runtimeKind: 'android-capacitor' | 'ios-capacitor' = 'android-capacitor') {
  useCompanionWorkspaceSync.mockReturnValue({
    bootstrapState: {
      booted_at: '2026-04-22T02:00:00.000Z',
      database_path: '/data/user/0/com.foliole.android/databases/foliole-companionSQLite.db',
      database_ready: true,
      device_id: 'android-test-device',
      runtime_kind: runtimeKind
    },
    isWorkspaceSyncStateReady: true,
    syncGroupDiscoveries: [],
    pendingJoinRequest: null,
    joinStatus: 'idle',
    manualSyncAction: null,
    syncConflictCount: 0,
    syncProgress: null,
    cancelJoin: vi.fn(),
    discoverSyncGroups: vi.fn(),
    leaveSyncGroup: vi.fn(),
    requestSyncGroupJoin: vi.fn(),
    checkDesktop: vi.fn(),
    clearError: vi.fn(),
    completePairing: vi.fn(),
    desktopDiscoveries: [],
    desktopDiscovery: null,
    error: null,
    pairingRequest: null,
    pairingState: {
      device_id: null,
      device_kind: null,
      device_name: null,
      is_paired: false,
      paired_at: null,
    },
    pairingStatus: 'idle',
    pullFromDesktop: vi.fn(),
    readableArticle: null,
    removeRememberedTarget: vi.fn(),
    replaceSnapshot: vi.fn(),
    requestPairing: vi.fn(),
    saveEndpoint: vi.fn(),
    saveSyncOnboardingStatus: vi.fn(),
    state: {
      endpoint_url: null,
      last_synced_at: null,
      remembered_targets: [],
      sync_events: [],
      sync_onboarding_status: 'dismissed',
      workspace_snapshot: null
    },
    status: 'idle'
  });
}

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  cleanup();
  useCompanionBootstrap.mockReset();
  useCompanionWorkspaceSync.mockReset();
  syncGroupStore.loadCompanionSyncGroup.mockClear();
  Object.values(syncGroupProvider).forEach((mock) => mock.mockClear());
  mockCompanionWorkspaceSync();
});

describe('CompanionApp bootstrap progress', () => {
  it('shows a booting state before the native bootstrap resolves', async () => {
    useCompanionBootstrap.mockReturnValue({ status: 'booting' });
    const { CompanionApp } = await import('./CompanionApp');

    render(<CompanionApp />);

    expect(screen.getByText('Starting companion runtime')).toBeInTheDocument();
  }, 30_000);

  it('shows a failure state when bootstrap rejects', async () => {
    useCompanionBootstrap.mockReturnValue({
      status: 'failed',
      message: 'Native companion bootstrap returned an invalid payload.'
    });
    const { CompanionApp } = await import('./CompanionApp');

    render(<CompanionApp />);

    expect(screen.getByText('Companion bootstrap failed')).toBeInTheDocument();
    expect(screen.getByText('Failed module: Companion bootstrap')).toBeInTheDocument();
    expect(screen.getByText('Native companion bootstrap returned an invalid payload.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
});

describe('CompanionApp ready hosts', () => {
  it('renders the article shell after Android bootstrap succeeds', async () => {
    useCompanionBootstrap.mockReturnValue({
      status: 'ready',
      state: {
        booted_at: '2026-04-22T02:00:00.000Z',
        database_path: '/data/user/0/com.foliole.android/databases/foliole-companionSQLite.db',
        database_ready: true,
        device_id: 'android-test-device',
        runtime_kind: 'android-capacitor'
      }
    });
    const { CompanionApp } = await import('./CompanionApp');

    render(<CompanionApp />);

    const bottomBar = screen.getAllByTestId('companion-bottom-tab-bar').at(-1);
    if (!bottomBar) {
      throw new Error('Expected companion bottom tab bar to render');
    }
    expect(within(bottomBar).getByRole('button', { name: 'Settings' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: /Sync/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sync content and view sync status/ })).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('companion-settings-sync'));
    expect(screen.getByTestId('companion-sync-toggle')).toBeInTheDocument();
    expect(screen.queryByTestId('companion-sync-pause-toggle')).not.toBeInTheDocument();
  });

  it('renders the shared Sync Group surface after iOS bootstrap succeeds', async () => {
    mockCompanionWorkspaceSync('ios-capacitor');
    useCompanionBootstrap.mockReturnValue({
      status: 'ready',
      state: {
        booted_at: '2026-07-19T08:00:00.000Z',
        database_path: '/Library/CapacitorDatabase/foliole-companionSQLite.db',
        database_ready: true,
        device_id: 'ios-test-device',
        runtime_kind: 'ios-capacitor'
      }
    });
    const { CompanionApp } = await import('./CompanionApp');

    render(<CompanionApp />);

    const bottomBar = screen.getAllByTestId('companion-bottom-tab-bar').at(-1);
    if (!bottomBar) {
      throw new Error('Expected companion bottom tab bar to render');
    }
    expect(within(bottomBar).getByRole('button', { name: 'Settings' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: /Sync/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sync content and view sync status/ })).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('companion-settings-sync'));
    expect(screen.getByTestId('companion-sync-toggle')).toBeInTheDocument();
    expect(screen.queryByTestId('companion-sync-pause-toggle')).not.toBeInTheDocument();
    await vi.waitFor(() => expect(syncGroupStore.loadCompanionSyncGroup).toHaveBeenCalled());
    await vi.waitFor(() => expect(syncGroupProvider.loadCompanionSyncGroupProviderState).toHaveBeenCalled());
    expect(syncGroupProvider.reconcileCompanionSyncGroupProvider).not.toHaveBeenCalled();
    expect(useCompanionWorkspaceSync).toHaveBeenCalledWith(expect.objectContaining({ runtime_kind: 'ios-capacitor' }));
  });

});
