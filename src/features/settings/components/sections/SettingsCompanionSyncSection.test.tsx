import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { STOPPED_SYNC_GROUP_DISCOVERY } from '../../../../../lib/platform/syncGroupDiscoveryContract';
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

function renderSyncSection(syncEnabled: boolean) {
  const disableSync = vi.fn();
  const enableSync = vi.fn();
  useDesktopSyncGroupMock.mockReturnValue({
    acceptRequest: vi.fn(),
    createSyncGroup: vi.fn(),
    discovery: STOPPED_SYNC_GROUP_DISCOVERY,
    disableSync,
    enableSync,
    error: null,
    isDesktopRuntime: true,
    isLoading: false,
    leaveSyncGroup: vi.fn(),
    overview: { ...EMPTY_DESKTOP_SYNC_GROUP_OVERVIEW, sync_enabled: syncEnabled },
    pauseSync: vi.fn(),
    pendingActionId: null,
    requestSyncGroupJoin: vi.fn(),
    rejectRequest: vi.fn(),
    resumeSync: vi.fn(),
    syncNow: vi.fn()
  });
  renderWithLocalization(<SettingsCompanionSyncSection />);
  return { disableSync, enableSync };
}

it('shows network sync as a switch with its current state', () => {
  const { disableSync } = renderSyncSection(true);

  const syncSwitch = screen.getByRole('switch', { name: 'Sync' });
  expect(syncSwitch).toHaveAttribute('aria-checked', 'true');

  fireEvent.click(syncSwitch);

  expect(disableSync).toHaveBeenCalledOnce();
  expect(screen.queryByRole('button', { name: 'Turn Off' })).not.toBeInTheDocument();
});
