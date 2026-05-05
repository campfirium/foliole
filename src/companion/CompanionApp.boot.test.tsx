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

describe('CompanionApp bootstrap states', () => {
  beforeEach(() => {
    vi.resetModules();
    useCompanionBootstrap.mockReset();
    useCompanionWorkspaceSync.mockReset();
    useCompanionWorkspaceSync.mockReturnValue({
      clearError: vi.fn(),
      error: null,
      pullFromDesktop: vi.fn(),
      readableArticle: null,
      saveEndpoint: vi.fn(),
      state: {
        endpoint_url: null,
        last_synced_at: null,
        remembered_targets: [],
        workspace_snapshot: null
      },
      status: 'idle'
    });
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

    expect(screen.getByText(/No article has been synced to this device yet/i)).toBeInTheDocument();
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
