import { beforeEach, describe, expect, it, vi } from 'vitest';

const loadBootstrap = vi.fn();
const capacitorState = vi.hoisted(() => ({
  getPlatform: vi.fn(() => 'ios'),
  isNativePlatform: vi.fn(() => true)
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: capacitorState,
  registerPlugin: () => ({ loadBootstrap })
}));

describe('companionBootstrap ios boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it('rejects ios before creating a web preview identity', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const { loadCompanionBootstrapState } = await import('./companionBootstrap');

    await expect(loadCompanionBootstrapState()).rejects.toMatchObject({
      capability: 'bootstrap',
      code: 'NATIVE_COMPANION_CAPABILITY_UNAVAILABLE',
      platform: 'ios'
    });
    expect(loadBootstrap).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
  });
});
