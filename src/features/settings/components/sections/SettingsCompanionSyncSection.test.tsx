import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import type { DesktopSyncGroupOverviewPayload } from '../../../../../lib/platform/nativeCompanionSyncContract';
import type { SyncGroupDevicePayload, SyncGroupPayload } from '../../../../../lib/platform/syncGroupContract';
import {
  STOPPED_SYNC_GROUP_DISCOVERY,
  type SyncGroupDiscoverySnapshot
} from '../../../../../lib/platform/syncGroupDiscoveryContract';
import { renderWithLocalization } from '../../../../shared/localization/testLocalization';
import { EMPTY_DESKTOP_SYNC_GROUP_OVERVIEW } from '../../../../shared/platform/desktopSyncGroupOverviewHooks';
import { registerAppConfirmationHandler } from '../../../../shared/ui/appConfirmation';

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
  group: SyncGroupPayload | null = null,
  overviewChanges: Partial<DesktopSyncGroupOverviewPayload> = {}
) {
  const createSyncGroup = vi.fn();
  const disableSync = vi.fn();
  const discoverSyncGroups = vi.fn();
  const enableSync = vi.fn();
  const recoverDiscovery = vi.fn();
  const openNetworkSettings = vi.fn();
  const overwriteExpiredMember = vi.fn();
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
    overwriteExpiredMember,
    removeSyncGroupDevice: vi.fn(),
    overview: { ...EMPTY_DESKTOP_SYNC_GROUP_OVERVIEW, sync_enabled: syncEnabled,
      sync_group: group, ...overviewChanges },
    openNetworkSettings,
    pauseSync: vi.fn(),
    pendingActionId: null,
    requestSyncGroupJoin: vi.fn(),
    rejectRequest: vi.fn(),
    recoverDiscovery,
    resumeSync: vi.fn(),
    syncNow: vi.fn()
  });
  renderWithLocalization(<SettingsCompanionSyncSection />);
  return { createSyncGroup, disableSync, discoverSyncGroups, enableSync,
    openNetworkSettings, overwriteExpiredMember, recoverDiscovery };
}

it('shows the macOS permission location and offers recovery after discovery denial', () => {
  const group = { group_id: 'group-1', display_name: 'Maci', local_device_identity_key: 'local',
    devices: [{ device_identity_key: 'local', device_name: 'Maci', platform: 'darwin', state: 'active' }] } as
    unknown as SyncGroupPayload;
  const { openNetworkSettings, recoverDiscovery } = renderSyncSection(true, STOPPED_SYNC_GROUP_DISCOVERY, group,
    { discovery_error: 'permission_required', host_platform: 'macOS' });

  expect(screen.getByText(/System Settings > Privacy & Security > Local Network/)).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));
  expect(recoverDiscovery).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole('button', { name: 'Open System Settings' }));
  expect(openNetworkSettings).toHaveBeenCalledOnce();
  expect(screen.queryByText('Finding sync anchor…')).not.toBeInTheDocument();
});

it('shows the macOS permission location while looking for a first Sync Group', () => {
  const discovery: SyncGroupDiscoverySnapshot = { candidates: [], change: 'failed',
    error_code: 'discovery_unavailable', status: 'permission_required' };
  const { discoverSyncGroups, openNetworkSettings } = renderSyncSection(true, discovery, null,
    { host_platform: 'macOS' });
  expect(screen.getByText(/System Settings > Privacy & Security > Local Network/)).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));
  expect(discoverSyncGroups).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole('button', { name: 'Open System Settings' }));
  expect(openNetworkSettings).toHaveBeenCalledOnce();
});

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

it('opens a separate notice for a rejected sync protocol', () => {
  renderSyncSection(true, {
    candidates: [], change: 'failed', error_code: 'protocol_incompatible', status: 'incompatible'
  });

  const dialog = screen.getByRole('dialog', { name: 'Cannot sync' });
  expect(dialog).toHaveTextContent('The devices use incompatible sync versions.');
  expect(dialog).toHaveTextContent('Update Foliole on all devices, then retry.');
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('dialog', { name: 'Cannot sync' })).not.toBeInTheDocument();
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

it('shows the persisted overwrite notice while restored sync is paused', () => {
  renderSyncSection(true, STOPPED_SYNC_GROUP_DISCOVERY, null, {
    sync_paused: true, pending_backup_restore: 'restore-pending'
  });
  expect(screen.getByText('Sync paused after restore')).toBeVisible();
  expect(screen.getByText(/including later edits/)).toBeVisible();
});

it('keeps removing targets out of normal devices and displays all remaining confirmers', () => {
  const devices: SyncGroupDevicePayload[] = ['Mac', 'Phone'].map(device_name => ({
    device_name, device_identity_key: device_name, canonical_library_path: `/private/${device_name}`,
    device_anchor: device_name, contract_version: 1, joined_at: 'now', last_seen_at: null,
    left_at: null, platform: 'darwin', state: 'active', updated_at: 'now'
  }));
  renderSyncSection(true, STOPPED_SYNC_GROUP_DISCOVERY, { devices, group_id: 'group-1',
    created_at: 'now', display_name: 'Mac', local_device_identity_key: 'Mac',
    device_display_names: { Mac: 'Mac (identity)' } }, {
    removing_devices: [{ target: { device_identity_key: 'Phone', device_name: 'Phone' },
      confirmed_devices: [{ device_identity_key: 'Mac', device_name: 'Mac (identity)' }] }]
  });
  expect(screen.getAllByText('Mac (identity)')).toHaveLength(2);
  expect(screen.getAllByText('Phone')).toHaveLength(1);
  expect(screen.queryByRole('button', { name: 'Remove from Sync Group' })).not.toBeInTheDocument();
  expect(screen.getByRole('table', { name: 'Removing' })).toHaveTextContent('Mac');
});

it.each([true, false])('overwrites an expired device only after the user confirms (confirmed=%s)', async confirmed => {
  const confirmation = vi.fn(async () => confirmed);
  const unregister = registerAppConfirmationHandler(confirmation);
  try {
    const { overwriteExpiredMember } = renderSyncSection(true, STOPPED_SYNC_GROUP_DISCOVERY, null, { expired_member: true });
    expect(screen.getByText('This device hasn’t synced for over 90 days')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Overwrite this device' }));
    await vi.waitFor(() => expect(confirmation).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Overwrite this device with the sync group’s data?' })));
    await Promise.resolve();
    expect(overwriteExpiredMember).toHaveBeenCalledTimes(confirmed ? 1 : 0);
  } finally { unregister(); }
});

it('shows no overwrite notice for a current device', () => {
  renderSyncSection(true, STOPPED_SYNC_GROUP_DISCOVERY, null, { expired_member: false });
  expect(screen.queryByRole('button', { name: 'Overwrite this device' })).toBeNull();
});
