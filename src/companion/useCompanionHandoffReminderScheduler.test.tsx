import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { NativeCompanionWorkspaceSyncState } from '../../lib/platform/nativeCompanionSyncContract';

const platform = vi.hoisted(() => ({
  loadCompanionDirtyNodes: vi.fn(async () => ({
    device_id: 'android-1',
    last_synced_at: null,
    nodes: []
  })),
  scheduleCompanionHandoffReminders: vi.fn(async () => ({ scheduled: 0, status: 'cancelled' }))
}));

vi.mock('../shared/platform/companionWorkspaceSync', () => ({
  loadCompanionDirtyNodes: platform.loadCompanionDirtyNodes
}));

vi.mock('../shared/platform/companionHandoffNotifications', () => ({
  scheduleCompanionHandoffReminders: platform.scheduleCompanionHandoffReminders
}));

function createWorkspaceSync(state?: Partial<NativeCompanionWorkspaceSyncState>) {
  return {
    state: {
      endpoint_url: 'http://desktop.local',
      last_synced_at: null,
      remembered_targets: [],
      sync_events: [],
      sync_onboarding_status: 'completed',
      workspace_snapshot: null,
      ...state
    },
    status: 'idle'
  } as never;
}

describe('useCompanionHandoffReminderScheduler', () => {
  beforeEach(() => {
    platform.loadCompanionDirtyNodes.mockReset();
    platform.scheduleCompanionHandoffReminders.mockReset();
    platform.loadCompanionDirtyNodes.mockResolvedValue({
      device_id: 'android-1',
      last_synced_at: null,
      nodes: []
    });
    platform.scheduleCompanionHandoffReminders.mockResolvedValue({ scheduled: 0, status: 'cancelled' });
  });

  it('schedules reminders from native dirty nodes', async () => {
    platform.loadCompanionDirtyNodes.mockResolvedValue({
      device_id: 'android-1',
      last_synced_at: null,
      nodes: [{ device_id: 'android-1', object_id: 'node-1', object_type: 'node', snapshot: {}, updated_at: '2026-04-25T10:00:00.000Z' }]
    });
    const { useCompanionHandoffReminderScheduler } = await import('./useCompanionHandoffReminderScheduler');

    renderHook(() =>
      useCompanionHandoffReminderScheduler({
        settings: { fixedTime: '18:00', shortDelay: '5' },
        workspaceSync: createWorkspaceSync()
      })
    );

    await waitFor(() => {
      expect(platform.scheduleCompanionHandoffReminders).toHaveBeenCalledWith({
        dirtyCount: 1,
        settings: { fixedTime: '18:00', shortDelay: '5' }
      });
    });
  });

  it('does not reschedule while sync is running', async () => {
    const { useCompanionHandoffReminderScheduler } = await import('./useCompanionHandoffReminderScheduler');

    renderHook(() =>
      useCompanionHandoffReminderScheduler({
        settings: { fixedTime: '18:00', shortDelay: '5' },
        workspaceSync: { ...createWorkspaceSync(), status: 'syncing' } as never
      })
    );

    expect(platform.loadCompanionDirtyNodes).not.toHaveBeenCalled();
    expect(platform.scheduleCompanionHandoffReminders).not.toHaveBeenCalled();
  });
});
