import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { useCompanionWorkspaceSync } from './useCompanionWorkspaceSync';

const platform = vi.hoisted(() => ({
  loadCompanionPendingSyncSummary: vi.fn(async () => ({ pendingCount: 0 })),
  scheduleCompanionHandoffReminders: vi.fn(async () => ({ scheduled: 0, status: 'cancelled' }))
}));

vi.mock('../shared/platform/companionSyncObjects', () => ({
  loadCompanionPendingSyncSummary: platform.loadCompanionPendingSyncSummary
}));

vi.mock('../shared/platform/companionHandoffNotifications', () => ({
  scheduleCompanionHandoffReminders: platform.scheduleCompanionHandoffReminders
}));

function createWorkspaceSync() {
  return {
    state: {
      endpoint_url: 'http://desktop.local',
      last_synced_at: null,
      remembered_targets: [],
      sync_events: [],
      sync_onboarding_status: 'completed',
      workspace_snapshot: null
    },
    status: 'idle' as const
  };
}

function asWorkspaceSync(value: unknown) {
  return value as unknown as ReturnType<typeof useCompanionWorkspaceSync>;
}

describe('useCompanionHandoffReminderScheduler', () => {
  beforeEach(() => {
    platform.loadCompanionPendingSyncSummary.mockReset();
    platform.scheduleCompanionHandoffReminders.mockReset();
    platform.loadCompanionPendingSyncSummary.mockResolvedValue({ pendingCount: 0 });
    platform.scheduleCompanionHandoffReminders.mockResolvedValue({ scheduled: 0, status: 'cancelled' });
  });

  it('schedules reminders from pending local sync streams', async () => {
    platform.loadCompanionPendingSyncSummary.mockResolvedValue({ pendingCount: 2 });
    const { useCompanionHandoffReminderScheduler } = await import('./useCompanionHandoffReminderScheduler');

    renderHook(() =>
      useCompanionHandoffReminderScheduler({
        settings: { fixedTime: '18:00', shortDelay: '5' },
        workspaceSync: asWorkspaceSync(createWorkspaceSync())
      })
    );

    await waitFor(() => {
      expect(platform.scheduleCompanionHandoffReminders).toHaveBeenCalledWith({
        dirtyCount: 2,
        settings: { fixedTime: '18:00', shortDelay: '5' }
      });
    });
  });

  it('does not reschedule while sync is running', async () => {
    const { useCompanionHandoffReminderScheduler } = await import('./useCompanionHandoffReminderScheduler');

    renderHook(() =>
      useCompanionHandoffReminderScheduler({
        settings: { fixedTime: '18:00', shortDelay: '5' },
        workspaceSync: asWorkspaceSync({ ...createWorkspaceSync(), status: 'syncing' })
      })
    );

    expect(platform.loadCompanionPendingSyncSummary).not.toHaveBeenCalled();
    expect(platform.scheduleCompanionHandoffReminders).not.toHaveBeenCalled();
  });

  it('reschedules after a local permanent mutation commits', async () => {
    const { runCompanionSyncMutationTask } = await import('../shared/platform/companionSyncMutationRevision');
    const { useCompanionHandoffReminderScheduler } = await import('./useCompanionHandoffReminderScheduler');
    renderHook(() => useCompanionHandoffReminderScheduler({
      settings: { fixedTime: '18:00', shortDelay: '5' },
      workspaceSync: asWorkspaceSync(createWorkspaceSync())
    }));
    await waitFor(() => expect(platform.scheduleCompanionHandoffReminders).toHaveBeenCalledTimes(1));
    platform.loadCompanionPendingSyncSummary.mockResolvedValue({ pendingCount: 1 });

    await act(() => runCompanionSyncMutationTask(async () => undefined));

    await waitFor(() => expect(platform.scheduleCompanionHandoffReminders).toHaveBeenLastCalledWith({
      dirtyCount: 1,
      settings: { fixedTime: '18:00', shortDelay: '5' }
    }));
  });
});
