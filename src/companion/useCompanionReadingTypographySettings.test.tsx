import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const syncObjectsMock = vi.hoisted(() => ({
  saveCompanionSyncSettingRecord: vi.fn()
}));

vi.mock('../shared/platform/companionSyncObjects', () => syncObjectsMock);
vi.mock('./companionReadingFonts', () => ({ activateReadingFont: vi.fn(async () => false) }));

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
        fontSize: 22,
        fontWeight: 400,
        lineHeight: 1.73,
        paragraphSpacing: 0.35, textWidth: 100
      });
    });

    expect(JSON.parse(window.localStorage.getItem('foliole-companion-reading-typography-settings') ?? '{}')).toEqual({
      contrast: 'high',
      fontFamily: 'serif',
      fontSize: 22,
      fontWeight: 400,
      lineHeight: 1.73,
      paragraphSpacing: 0.35, textWidth: 100
    });
    expect(syncObjectsMock.saveCompanionSyncSettingRecord).not.toHaveBeenCalled();
  });

  it('returns to the system font when a previously selected import is missing', async () => {
    window.localStorage.setItem('foliole-companion-reading-typography-settings', JSON.stringify({
      fontFamily: 'custom:12345678-1234-1234-1234-123456789abc'
    }));
    const { useCompanionReadingTypographySettings } = await import('./useCompanionReadingTypographySettings');
    const { result } = renderHook(() => useCompanionReadingTypographySettings());
    await waitFor(() => expect(result.current.settings.fontFamily).toBe('sans'));
    expect(JSON.parse(window.localStorage.getItem('foliole-companion-reading-typography-settings') ?? '{}').fontFamily)
      .toBe('sans');
  });
});

it('keeps a selected font id and reports a retryable load failure', async () => {
  const fonts = await import('./companionReadingFonts');
  vi.mocked(fonts.activateReadingFont).mockRejectedValueOnce(new Error('font load failed'));
  window.localStorage.setItem('foliole-companion-reading-typography-settings', JSON.stringify({
    fontFamily: 'custom:12345678-1234-1234-1234-123456789abc'
  }));
  const { useCompanionReadingTypographySettings } = await import('./useCompanionReadingTypographySettings');
  const { result } = renderHook(() => useCompanionReadingTypographySettings());
  await waitFor(() => expect(result.current.fontLoadError).toBe(true));
  expect(result.current.settings.fontFamily).toBe('custom:12345678-1234-1234-1234-123456789abc');
  expect(JSON.parse(window.localStorage.getItem('foliole-companion-reading-typography-settings')!).fontFamily)
    .toBe('custom:12345678-1234-1234-1234-123456789abc');
  window.localStorage.clear();
});
