import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const syncObjectsMock = vi.hoisted(() => ({
  loadCompanionSyncSettingValueJson: vi.fn(async () => null),
  saveCompanionSyncSettingRecord: vi.fn(async () => ({ content_hash: 'hash-setting', object_id: 'setting-1' }))
}));

vi.mock('../shared/platform/companionSyncObjects', () => syncObjectsMock);

describe('useCompanionHandoffReminderSettings', () => {
  beforeEach(() => {
    syncObjectsMock.loadCompanionSyncSettingValueJson.mockReset();
    syncObjectsMock.loadCompanionSyncSettingValueJson.mockResolvedValue(null);
    syncObjectsMock.saveCompanionSyncSettingRecord.mockClear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it('persists mobile handoff reminder settings into the setting sync stream', async () => {
    const { useCompanionHandoffReminderSettings } = await import('./useCompanionHandoffReminderSettings');
    const { result } = renderHook(() => useCompanionHandoffReminderSettings());

    act(() => {
      result.current.updateSettings({ fixedTime: '21:00', shortDelay: '5' });
    });

    expect(syncObjectsMock.saveCompanionSyncSettingRecord).toHaveBeenCalledWith({
      key: 'handoff_reminder_settings',
      valueJson: JSON.stringify({ fixedTime: '21:00', shortDelay: '5' })
    });
  });

  it('hydrates the cached settings from the native setting record', async () => {
    syncObjectsMock.loadCompanionSyncSettingValueJson.mockResolvedValue(
      JSON.stringify({ fixedTime: '20:30', shortDelay: '15' })
    );
    const { useCompanionHandoffReminderSettings } = await import('./useCompanionHandoffReminderSettings');
    const { result } = renderHook(() => useCompanionHandoffReminderSettings());

    await act(async () => {});

    expect(result.current.settings).toEqual({ fixedTime: '20:30', shortDelay: '15' });
    expect(JSON.parse(window.localStorage.getItem('foliole-companion-handoff-reminder-settings') ?? 'null'))
      .toEqual({ fixedTime: '20:30', shortDelay: '15' });
  });

  it('does not replace a user update when native hydration finishes later', async () => {
    let resolveHydration: (value: string | null) => void = () => {};
    syncObjectsMock.loadCompanionSyncSettingValueJson.mockReturnValue(new Promise((resolve) => {
      resolveHydration = resolve;
    }));
    const { useCompanionHandoffReminderSettings } = await import('./useCompanionHandoffReminderSettings');
    const { result } = renderHook(() => useCompanionHandoffReminderSettings());

    act(() => result.current.updateSettings({ fixedTime: '21:00', shortDelay: '5' }));
    await act(async () => resolveHydration(JSON.stringify({ fixedTime: '19:00', shortDelay: '2' })));

    expect(result.current.settings).toEqual({ fixedTime: '21:00', shortDelay: '5' });
  });

  it('rehydrates after a completed sync brings in the setting record', async () => {
    syncObjectsMock.loadCompanionSyncSettingValueJson
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(JSON.stringify({ fixedTime: '19:30', shortDelay: '30' }));
    const { useCompanionHandoffReminderSettings } = await import('./useCompanionHandoffReminderSettings');
    const { result, rerender } = renderHook(
      ({ lastSyncedAt }) => useCompanionHandoffReminderSettings(lastSyncedAt),
      { initialProps: { lastSyncedAt: null as string | null } }
    );
    await act(async () => {});

    rerender({ lastSyncedAt: '2026-07-21T00:20:00.000Z' });
    await act(async () => {});

    expect(result.current.settings).toEqual({ fixedTime: '19:30', shortDelay: '30' });
    expect(syncObjectsMock.loadCompanionSyncSettingValueJson).toHaveBeenCalledTimes(2);
  });
});
