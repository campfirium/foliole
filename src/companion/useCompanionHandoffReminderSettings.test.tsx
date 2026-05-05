import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const syncObjectsMock = vi.hoisted(() => ({
  saveCompanionSyncSettingRecord: vi.fn(async () => ({ content_hash: 'hash-setting', object_id: 'setting-1' }))
}));

vi.mock('../shared/platform/companionSyncObjects', () => syncObjectsMock);

describe('useCompanionHandoffReminderSettings', () => {
  beforeEach(() => {
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
});
