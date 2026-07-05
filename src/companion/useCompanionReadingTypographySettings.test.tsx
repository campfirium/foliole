import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const syncObjectsMock = vi.hoisted(() => ({
  saveCompanionSyncSettingRecord: vi.fn()
}));

vi.mock('../shared/platform/companionSyncObjects', () => syncObjectsMock);

describe('useCompanionReadingTypographySettings', () => {
  afterEach(() => {
    window.localStorage.clear();
    syncObjectsMock.saveCompanionSyncSettingRecord.mockClear();
  });

  it('keeps reading typography as local device display state', async () => {
    const { useCompanionReadingTypographySettings } = await import('./useCompanionReadingTypographySettings');
    const { result } = renderHook(() => useCompanionReadingTypographySettings());

    act(() => {
      result.current.updateSettings({
        contrast: 'high',
        fontFamily: 'serif',
        fontSize: 'xlarge',
        lineHeight: 'relaxed'
      });
    });

    expect(JSON.parse(window.localStorage.getItem('foliole-companion-reading-typography-settings') ?? '{}')).toEqual({
      contrast: 'high',
      fontFamily: 'serif',
      fontSize: 'xlarge',
      lineHeight: 'relaxed'
    });
    expect(syncObjectsMock.saveCompanionSyncSettingRecord).not.toHaveBeenCalled();
  });
});
