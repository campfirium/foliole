import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import type { SyncGroupDevicePayload, SyncGroupPayload } from '../../../../../lib/platform/syncGroupContract';
import {
  STOPPED_SYNC_GROUP_DISCOVERY,
  type SyncGroupDiscoverySnapshot
} from '../../../../../lib/platform/syncGroupDiscoveryContract';
import { renderWithLocalization } from '../../../../shared/localization/testLocalization';
import { EMPTY_DESKTOP_SYNC_GROUP_OVERVIEW } from '../../../../shared/platform/desktopSyncGroupOverviewHooks';

import { SettingsCompanionSyncSection } from './SettingsCompanionSyncSection';

const useDesktopSyncGroupMock = vi.hoisted(() => vi.fn());

vi.mock('../../../../shared/platform/useDesktopSyncGroup', () => ({
  useDesktopSyncGroup: useDesktopSyncGroupMock
}));

beforeEach(() => {
  useDesktopSyncGroupMock.mockReset();
});

function renderSyncSection(
  syncEnabled: boolean,
  discovery: SyncGroupDiscoverySnapshot = STOPPED_SYNC_GROUP_DISCOVERY,
  group: SyncGroupPayload | null = null
) {
  const createSyncGroup = vi.fn();
  const disableSync = vi.fn();
  const discoverSyncGroups = vi.fn();
  const enableSync = vi.fn();
  useDesktopSyncGroupMock.mockReturnValue({
    acceptRequest: vi.fn(),
    createSyncGroup,
    discovery,
    disableSync,
    discoverSyncGroups,
    enableSync,
    error: null,
    isDesktopRuntime: true,
    isLoading: false,
    leaveSyncGroup: vi.fn(),
    removeSyncGroupDevice: vi.fn(),
    overview: { ...EMPTY_DESKTOP_SYNC_GROUP_OVERVIEW, sync_enabled: syncEnabled, sync_group: group },
    pauseSync: vi.fn(),
    pendingActionId: null,
    requestSyncGroupJoin: vi.fn(),
    rejectRequest: vi.fn(),
    resumeSync: vi.fn(),
    syncNow: vi.fn()
  });
  renderWithLocalization(<SettingsCompanionSyncSection />);
  return { createSyncGroup, disableSync, discoverSyncGroups, enableSync };
}

it('shows network sync as a switch with its current state', () => {
  const { disableSync } = renderSyncSection(true);

  const syncSwitch = screen.getByRole('switch', { name: 'Sync' });
  expect(syncSwitch).toHaveAttribute('aria-checked', 'true');

  fireEvent.click(syncSwitch);

  expect(disableSync).toHaveBeenCalledOnce();
  expect(screen.queryByRole('button', { name: 'Turn Off' })).not.toBeInTheDocument();
});

it('presents finding and creating as equal commands with the empty-state description', () => {
  const { createSyncGroup, discoverSyncGroups } = renderSyncSection(true);

  expect(screen.getByText('Create a new Sync Group or join one from an active Device on this network.')).toBeVisible();
  const findButton = screen.getByRole('button', { name: 'Find Sync Group' });
  const createButton = screen.getByRole('button', { name: 'Create Sync Group' });
  expect(findButton.className).toBe(createButton.className);
  expect(screen.queryByText('Searching for Sync Groups…')).not.toBeInTheDocument();

  fireEvent.click(findButton);
  fireEvent.click(createButton);

  expect(discoverSyncGroups).toHaveBeenCalledOnce();
  expect(createSyncGroup).toHaveBeenCalledOnce();
});

it('keeps creation available while discovery is searching', () => {
  renderSyncSection(true, {
    candidates: [],
    change: 'started',
    error_code: null,
    status: 'searching'
  });

  expect(screen.getByRole('button', { name: 'Searching...' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Create Sync Group' })).toBeEnabled();
  expect(screen.getByText('Searching for Sync Groups…')).toBeVisible();
});

it('does not describe anchor discovery while Sync is off', () => {
  const localDevice: SyncGroupDevicePayload = {
    canonical_library_path: '/library/local', contract_version: 1,
    device_anchor: 'local', device_identity_key: 'local', device_name: 'Maci',
    joined_at: '2026-09-15T00:00:00.000Z', last_seen_at: null, left_at: null,
    platform: 'darwin', state: 'active', updated_at: '2026-09-15T00:00:00.000Z'
  };
  const group: SyncGroupPayload = {
    created_at: '2026-09-15T00:00:00.000Z', devices: [localDevice],
    display_name: 'Maci', group_id: 'group-1', local_device_identity_key: 'local'
  };
  renderSyncSection(false, STOPPED_SYNC_GROUP_DISCOVERY, group);

  expect(screen.getByRole('switch', { name: 'Sync' })).toHaveAttribute('aria-checked', 'false');
  expect(screen.getByText('Sync off')).toBeVisible();
  expect(screen.queryByText('Finding sync anchor…')).not.toBeInTheDocument();
});
