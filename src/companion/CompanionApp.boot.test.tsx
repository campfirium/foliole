import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const useCompanionBootstrap = vi.fn();
const useCompanionWorkspaceSync = vi.fn();

vi.mock('./useCompanionBootstrap', () => ({
  useCompanionBootstrap
}));

vi.mock('./useCompanionWorkspaceSync', () => ({
  useCompanionWorkspaceSync
}));

function mockCompanionWorkspaceSync() {
  useCompanionWorkspaceSync.mockReturnValue({
    bootstrapState: {
      booted_at: '2026-04-22T02:00:00.000Z',
      database_path: '/data/user/0/com.foliole.android/databases/foliole-companion.db',
      database_ready: true,
      device_id: 'android-test-device',
      runtime_kind: 'android-capacitor'
    },
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
      paired_at: null
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

describe('CompanionApp bootstrap states', () => {
  beforeEach(() => {
    vi.resetModules();
    useCompanionBootstrap.mockReset();
    useCompanionWorkspaceSync.mockReset();
    mockCompanionWorkspaceSync();
  });

  it('shows a booting state before the native bootstrap resolves', async () => {
    useCompanionBootstrap.mockReturnValue({ status: 'booting' });
    const { CompanionApp } = await import('./CompanionApp');

    render(<CompanionApp />);

    expect(screen.getByText('Starting companion runtime')).toBeInTheDocument();
  });

  it('renders the article shell after bootstrap succeeds', async () => {
    useCompanionBootstrap.mockReturnValue({
      status: 'ready',
      state: {
        booted_at: '2026-04-22T02:00:00.000Z',
        database_path: '/data/user/0/com.foliole.android/databases/foliole-companion.db',
        database_ready: true,
        device_id: 'android-test-device',
        runtime_kind: 'android-capacitor'
      }
    });
    const { CompanionApp } = await import('./CompanionApp');

    render(<CompanionApp />);

    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByLabelText('Review')).toBeInTheDocument();
  });

  it('shows a failure state when bootstrap rejects', async () => {
    useCompanionBootstrap.mockReturnValue({
      status: 'failed',
      message: 'Native companion bootstrap returned an invalid payload.'
    });
    const { CompanionApp } = await import('./CompanionApp');

    render(<CompanionApp />);

    expect(screen.getByText('Companion bootstrap failed')).toBeInTheDocument();
    expect(screen.getByText('Native companion bootstrap returned an invalid payload.')).toBeInTheDocument();
  });
});
