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

  it('exposes only the implemented ios native capabilities', async () => {
    capacitorState.isNativePlatform.mockReturnValue(true);
    capacitorState.getPlatform.mockReturnValue('ios');
    const { requireAvailableCompanionRuntime } = await import('./companionRuntimeCapabilities');

    expect(requireAvailableCompanionRuntime('attachment-resource-sync')).toEqual({ kind: 'ios-native', platform: 'ios' });
    expect(requireAvailableCompanionRuntime('bootstrap')).toEqual({ kind: 'ios-native', platform: 'ios' });
    expect(requireAvailableCompanionRuntime('content-blob-sync')).toEqual({ kind: 'ios-native', platform: 'ios' });
    expect(requireAvailableCompanionRuntime('external-document-directory')).toEqual({ kind: 'ios-native', platform: 'ios' });
    expect(requireAvailableCompanionRuntime('external-document-read')).toEqual({ kind: 'ios-native', platform: 'ios' });
    expect(requireAvailableCompanionRuntime('external-document-search')).toEqual({ kind: 'ios-native', platform: 'ios' });
    expect(requireAvailableCompanionRuntime('pairing-runtime')).toEqual({ kind: 'ios-native', platform: 'ios' });
    expect(requireAvailableCompanionRuntime('pdf-page-text')).toEqual({ kind: 'ios-native', platform: 'ios' });
    expect(requireAvailableCompanionRuntime('sync-pack-apply')).toEqual({ kind: 'ios-native', platform: 'ios' });
    expect(requireAvailableCompanionRuntime('sync-diagnostics')).toEqual({ kind: 'ios-native', platform: 'ios' });
    expect(requireAvailableCompanionRuntime('sync-object-read')).toEqual({ kind: 'ios-native', platform: 'ios' });
    expect(requireAvailableCompanionRuntime('setting-write')).toEqual({ kind: 'ios-native', platform: 'ios' });
    expect(requireAvailableCompanionRuntime('topic-search')).toEqual({ kind: 'ios-native', platform: 'ios' });
    expect(requireAvailableCompanionRuntime('view-state-write')).toEqual({ kind: 'ios-native', platform: 'ios' });
    expect(() => requireAvailableCompanionRuntime('native-runtime')).toThrowError(
      expect.objectContaining({
        capability: 'native-runtime',
        code: 'NATIVE_COMPANION_CAPABILITY_UNAVAILABLE',
        platform: 'ios'
      })
    );
  });
});
