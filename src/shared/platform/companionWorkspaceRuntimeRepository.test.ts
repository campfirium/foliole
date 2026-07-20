import { beforeEach, describe, expect, it, vi } from 'vitest';

const capacitorState = vi.hoisted(() => ({
  getPlatform: vi.fn(() => 'web'),
  isNativePlatform: vi.fn(() => false),
  registerPlugin: vi.fn(() => ({}))
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: capacitorState,
  registerPlugin: capacitorState.registerPlugin
}));

import {
  isAvailableNativeAndroidCompanionRuntime,
  isNativeAndroidCompanionRuntime,
  isNativeCompanionAttachmentResourceRuntime,
  isNativeCompanionContentBlobRuntime,
  isNativeCompanionPairingRuntime,
  isNativeCompanionTopicSearchRuntime
} from './companionWorkspaceRuntimeRepository';

describe('companion workspace runtime boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capacitorState.getPlatform.mockReturnValue('web');
    capacitorState.isNativePlatform.mockReturnValue(false);
  });

  it('keeps browser preview on the explicit non-native path', () => {
    expect(isNativeAndroidCompanionRuntime()).toBe(false);
    expect(isNativeCompanionAttachmentResourceRuntime()).toBe(false);
    expect(isNativeCompanionContentBlobRuntime()).toBe(false);
    expect(isNativeCompanionPairingRuntime()).toBe(false);
    expect(isNativeCompanionTopicSearchRuntime()).toBe(false);
    expect(isAvailableNativeAndroidCompanionRuntime()).toBe(false);
  });

  it('exposes the implemented Android runtime', () => {
    capacitorState.getPlatform.mockReturnValue('android');
    capacitorState.isNativePlatform.mockReturnValue(true);

    expect(isNativeAndroidCompanionRuntime()).toBe(true);
    expect(isNativeCompanionAttachmentResourceRuntime()).toBe(true);
    expect(isNativeCompanionContentBlobRuntime()).toBe(true);
    expect(isNativeCompanionPairingRuntime()).toBe(true);
    expect(isNativeCompanionTopicSearchRuntime()).toBe(true);
    expect(isAvailableNativeAndroidCompanionRuntime()).toBe(true);
  });

  it('rejects Android-only operations on iOS without a Web fallback', () => {
    capacitorState.getPlatform.mockReturnValue('ios');
    capacitorState.isNativePlatform.mockReturnValue(true);

    expect(isAvailableNativeAndroidCompanionRuntime()).toBe(false);
    expect(isNativeCompanionAttachmentResourceRuntime()).toBe(true);
    expect(isNativeCompanionContentBlobRuntime()).toBe(true);
    expect(isNativeCompanionPairingRuntime()).toBe(true);
    expect(isNativeCompanionTopicSearchRuntime()).toBe(true);
    expect(() => isNativeAndroidCompanionRuntime()).toThrowError(expect.objectContaining({
      capability: 'native-runtime',
      code: 'NATIVE_COMPANION_CAPABILITY_UNAVAILABLE',
      platform: 'ios'
    }));
  });
});
