import { beforeEach, describe, expect, it, vi } from 'vitest';

const loadBootstrap = vi.fn();
const initializeDatabase = vi.hoisted(() => vi.fn(async (state) => ({
  ...state, device_id: 'frozen-execution-id', device_name: state.host_name
})));
const capacitorState = vi.hoisted(() => ({
  getPlatform: vi.fn(() => 'web'),
  isNativePlatform: vi.fn(() => false)
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: capacitorState,
  registerPlugin: () => ({
    loadBootstrap
  })
}));
vi.mock('./companion/runtime/iosCompanionDatabaseBootstrap', () => ({
  initializeIosCompanionDatabase: initializeDatabase
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  capacitorState.getPlatform.mockReturnValue('web');
  capacitorState.isNativePlatform.mockReturnValue(false);
  window.localStorage.clear();
});

describe('companionBootstrap', () => {
  it('uses one explicit web-preview Host without creating a stable browser identity', async () => {
    const { loadCompanionBootstrapState } = await import('./companionBootstrap');

    const first = await loadCompanionBootstrapState();
    const second = await loadCompanionBootstrapState();

    expect(first.runtime_kind).toBe('web-preview');
    expect(first.database_ready).toBe(false);
    expect(first.database_path).toBe('foliole-companion-preview.db');
    expect(first.device_id).toBe('web-preview');
    expect(first.device_name).toBe('Web preview');
    expect(first.host_name).toBe('Web preview');
    expect(second.device_id).toBe(first.device_id);
    expect(window.localStorage).toHaveLength(0);
  });

  it('loads native bootstrap payload through the Capacitor plugin on android', async () => {
    capacitorState.isNativePlatform.mockReturnValue(true);
    capacitorState.getPlatform.mockReturnValue('android');
    loadBootstrap.mockResolvedValue({
      booted_at: '2026-04-22T02:00:00.000Z',
      database_path: '/data/user/0/com.foliole.android/databases/foliole-companionSQLite.db',
      database_ready: true,
      host_name: 'Pixel 9',
      runtime_kind: 'android-capacitor'
    });

    const { loadCompanionBootstrapState } = await import('./companionBootstrap');
    await expect(loadCompanionBootstrapState()).resolves.toEqual({
      booted_at: '2026-04-22T02:00:00.000Z',
      database_path: '/data/user/0/com.foliole.android/databases/foliole-companionSQLite.db',
      database_ready: true,
      device_id: 'frozen-execution-id',
      device_name: 'Pixel 9',
      host_name: 'Pixel 9',
      runtime_kind: 'android-capacitor'
    });
    expect(loadBootstrap).toHaveBeenCalledTimes(1);
    expect(initializeDatabase).toHaveBeenCalledWith(expect.objectContaining({
      host_name: 'Pixel 9',
      runtime_kind: 'android-capacitor'
    }));
  });

  it('rejects malformed native bootstrap payloads', async () => {
    capacitorState.isNativePlatform.mockReturnValue(true);
    capacitorState.getPlatform.mockReturnValue('android');
    loadBootstrap.mockResolvedValue({
      database_ready: true,
      host_name: 'Pixel 9',
      runtime_kind: 'android-capacitor'
    });

    const { loadCompanionBootstrapState } = await import('./companionBootstrap');
    await expect(loadCompanionBootstrapState()).rejects.toThrow(/invalid payload/i);
  });
});

describe('companionBootstrap native owner lifecycle', () => {
  it('reuses one owner across sync retries and foreground returns', async () => {
    capacitorState.isNativePlatform.mockReturnValue(true);
    capacitorState.getPlatform.mockReturnValue('android');
    loadBootstrap.mockResolvedValue({
      booted_at: '2026-08-06T02:00:00.000Z',
      database_path: null,
      database_ready: false,
      host_name: 'Pixel 9',
      runtime_kind: 'android-capacitor'
    });

    const { loadCompanionBootstrapState } = await import('./companionBootstrap');
    const startup = loadCompanionBootstrapState();
    const structureSync = loadCompanionBootstrapState();
    const [startupState, structureState] = await Promise.all([startup, structureSync]);
    const retryState = await loadCompanionBootstrapState();
    const foregroundState = await loadCompanionBootstrapState();

    expect(structureState).toBe(startupState);
    expect(retryState).toBe(startupState);
    expect(foregroundState).toBe(startupState);
    expect(loadBootstrap).toHaveBeenCalledTimes(1);
    expect(initializeDatabase).toHaveBeenCalledTimes(1);
  });
});

describe('companionBootstrap nullable native fields', () => {
  it('normalizes an omitted database path before the shared owner opens it', async () => {
    capacitorState.isNativePlatform.mockReturnValue(true);
    capacitorState.getPlatform.mockReturnValue('android');
    loadBootstrap.mockResolvedValue({
      booted_at: '2026-08-06T02:00:00.000Z', database_ready: false,
      host_name: 'Pixel 9', runtime_kind: 'android-capacitor'
    });

    const { loadCompanionBootstrapState } = await import('./companionBootstrap');
    await loadCompanionBootstrapState();

    expect(initializeDatabase).toHaveBeenCalledWith(expect.objectContaining({ database_path: null }));
  });
});
