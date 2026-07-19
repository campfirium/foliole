import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const useCompanionBootstrap = vi.fn();
const useCompanionWorkspaceSync = vi.fn();

vi.setConfig({ testTimeout: 30_000 });

vi.mock('./useCompanionBootstrap', () => ({
  useCompanionBootstrap
}));

vi.mock('./useCompanionWorkspaceSync', () => ({
  useCompanionWorkspaceSync
}));

vi.mock('@/features/pdf/components/SimplePdfDocument', () => ({
  SimplePdfDocument: () => <div>PDF original viewer</div>
}));

function mockCompanionWorkspaceSync() {
  useCompanionWorkspaceSync.mockReturnValue({
    bootstrapState: {
      booted_at: '2026-04-22T02:00:00.000Z',
      database_path: '/data/user/0/com.foliole.android/databases/foliole-companionSQLite.db',
      database_ready: true,
      device_id: 'android-test-device',
      runtime_kind: 'android-capacitor'
    },
    isWorkspaceSyncStateReady: true,
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
      primary_device_id: null
    },
    pairingStatus: 'idle',
    pullFromDesktop: vi.fn(),
    readableArticle: null,
    removeRememberedTarget: vi.fn(),
    replaceSnapshot: vi.fn(),
    requestPrimaryDeviceTakeover: vi.fn(),
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
    expect(screen.getByRole('button', { name: /Connect or refresh this device/ })).toBeInTheDocument();
  });

  it('keeps the prepared iOS host outside Android-only product surfaces', async () => {
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

    expect(screen.getByText('This iPhone is ready')).toBeInTheDocument();
    expect(screen.getByText(/Topic browsing, review, and sync are not available/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Sync/ })).not.toBeInTheDocument();
  });

});
