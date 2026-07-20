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

import { supportsCompanionAppDataClear } from './companionAppDataRuntimeRepository';

describe('companion app data clear capability', () => {
  beforeEach(() => {
    capacitorState.getPlatform.mockReturnValue('web');
    capacitorState.isNativePlatform.mockReturnValue(false);
  });

  it('keeps the existing Android and Web clear paths available', () => {
    expect(supportsCompanionAppDataClear()).toBe(true);

    capacitorState.getPlatform.mockReturnValue('android');
    capacitorState.isNativePlatform.mockReturnValue(true);
    expect(supportsCompanionAppDataClear()).toBe(true);
  });

  it('keeps iOS unavailable until every native data store can be cleared', () => {
    capacitorState.getPlatform.mockReturnValue('ios');
    capacitorState.isNativePlatform.mockReturnValue(true);

    expect(supportsCompanionAppDataClear()).toBe(false);
  });
});
