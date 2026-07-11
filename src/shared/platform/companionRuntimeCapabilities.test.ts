import { beforeEach, describe, expect, it, vi } from 'vitest';

const capacitorState = vi.hoisted(() => ({
  getPlatform: vi.fn(() => 'web'),
  isNativePlatform: vi.fn(() => false)
}));

vi.mock('@capacitor/core', () => ({ Capacitor: capacitorState }));

describe('companionRuntimeCapabilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capacitorState.getPlatform.mockReturnValue('web');
    capacitorState.isNativePlatform.mockReturnValue(false);
  });

  it('classifies browser preview separately from native hosts', async () => {
    const { getCompanionRuntimeCapability } = await import('./companionRuntimeCapabilities');
    expect(getCompanionRuntimeCapability()).toEqual({ kind: 'web-preview', platform: 'web' });
  });

  it('classifies the implemented android native host as available', async () => {
    capacitorState.isNativePlatform.mockReturnValue(true);
    capacitorState.getPlatform.mockReturnValue('android');
    const { getCompanionRuntimeCapability } = await import('./companionRuntimeCapabilities');
    expect(getCompanionRuntimeCapability()).toEqual({ kind: 'android-native', platform: 'android' });
  });

  it('rejects an unimplemented ios native capability with a stable error', async () => {
    capacitorState.isNativePlatform.mockReturnValue(true);
    capacitorState.getPlatform.mockReturnValue('ios');
    const { requireAvailableCompanionRuntime } = await import('./companionRuntimeCapabilities');

    expect(() => requireAvailableCompanionRuntime('bootstrap')).toThrowError(
      expect.objectContaining({
        capability: 'bootstrap',
        code: 'NATIVE_COMPANION_CAPABILITY_UNAVAILABLE',
        platform: 'ios'
      })
    );
  });
});
