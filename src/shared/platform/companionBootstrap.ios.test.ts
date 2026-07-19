import { beforeEach, describe, expect, it, vi } from 'vitest';

const loadBootstrap = vi.fn();
const initializeIosCompanionDatabase = vi.fn();
const capacitorState = vi.hoisted(() => ({
  getPlatform: vi.fn(() => 'ios'),
  isNativePlatform: vi.fn(() => true)
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: capacitorState,
  registerPlugin: () => ({ loadBootstrap })
}));

vi.mock('./iosCompanionDatabaseBootstrap', () => ({ initializeIosCompanionDatabase }));

describe('companionBootstrap ios boundary', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    window.localStorage.clear();
    initializeIosCompanionDatabase.mockImplementation(async (state) => ({
      ...state,
      database_path: '/Library/CapacitorDatabase/foliole-companionSQLite.db',
      database_ready: true
    }));
  });

  it('loads ios bootstrap through the native plugin without creating a web identity', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    loadBootstrap.mockResolvedValue({
      booted_at: '2026-07-19T08:00:00Z',
      database_path: null,
      database_ready: false,
      device_id: 'ios-test-device',
      device_name: 'iPhone',
      runtime_kind: 'ios-capacitor'
    });
    const { loadCompanionBootstrapState } = await import('./companionBootstrap');

    await expect(loadCompanionBootstrapState()).resolves.toEqual({
      booted_at: '2026-07-19T08:00:00Z',
      database_path: '/Library/CapacitorDatabase/foliole-companionSQLite.db',
      database_ready: true,
      device_id: 'ios-test-device',
      device_name: 'iPhone',
      runtime_kind: 'ios-capacitor'
    });
    expect(loadBootstrap).toHaveBeenCalledTimes(1);
    expect(initializeIosCompanionDatabase).toHaveBeenCalledWith(expect.objectContaining({
      database_ready: false,
      runtime_kind: 'ios-capacitor'
    }));
    expect(setItem).not.toHaveBeenCalled();
  });
});
