import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getPlatform: vi.fn(() => 'web'),
  isNativePlatform: vi.fn(() => false),
  plugin: {
    savePrimaryDeviceId: vi.fn()
  },
  readStoredWebPairingState: vi.fn(),
  writeWebPairingState: vi.fn()
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    getPlatform: mocks.getPlatform,
    isNativePlatform: mocks.isNativePlatform
  },
  registerPlugin: vi.fn(() => mocks.plugin)
}));

vi.mock('./companionPairingState', () => ({
  readStoredWebPairingState: mocks.readStoredWebPairingState,
  writeWebPairingState: mocks.writeWebPairingState
}));

import { saveLocalPrimaryDeviceId } from './companionPrimaryDeviceIdentity';

const pairingState = {
  device_id: 'companion-device',
  primary_device_id: 'desktop-old'
};

function useNativePlatform(platform: 'android' | 'ios') {
  mocks.getPlatform.mockReturnValue(platform);
  mocks.isNativePlatform.mockReturnValue(true);
}

describe('companion primary device identity persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getPlatform.mockReturnValue('web');
    mocks.isNativePlatform.mockReturnValue(false);
    mocks.readStoredWebPairingState.mockReturnValue(pairingState);
    mocks.plugin.savePrimaryDeviceId.mockResolvedValue({
      ...pairingState,
      primary_device_id: 'desktop-new'
    });
    mocks.writeWebPairingState.mockImplementation((state) => state);
  });

  it.each(['android', 'ios'] as const)('persists through the %s pairing bridge', async (platform) => {
    useNativePlatform(platform);

    await expect(saveLocalPrimaryDeviceId('desktop-new')).resolves.toMatchObject({
      primary_device_id: 'desktop-new'
    });
    expect(mocks.plugin.savePrimaryDeviceId).toHaveBeenCalledWith({
      primary_device_id: 'desktop-new'
    });
    expect(mocks.writeWebPairingState).not.toHaveBeenCalled();
  });

  it('keeps browser preview on Web pairing storage', async () => {
    await expect(saveLocalPrimaryDeviceId('desktop-new')).resolves.toMatchObject({
      primary_device_id: 'desktop-new'
    });
    expect(mocks.writeWebPairingState).toHaveBeenCalledWith({
      ...pairingState,
      primary_device_id: 'desktop-new'
    });
    expect(mocks.plugin.savePrimaryDeviceId).not.toHaveBeenCalled();
  });

  it('rejects a missing Web pairing state', async () => {
    mocks.readStoredWebPairingState.mockReturnValue(null);

    await expect(saveLocalPrimaryDeviceId('desktop-new')).rejects.toThrow('pairing state is missing');
    expect(mocks.writeWebPairingState).not.toHaveBeenCalled();
  });

  it('propagates native persistence failures without a Web fallback', async () => {
    useNativePlatform('ios');
    mocks.plugin.savePrimaryDeviceId.mockRejectedValue(new Error('native persistence failed'));

    await expect(saveLocalPrimaryDeviceId('desktop-new')).rejects.toThrow('native persistence failed');
    expect(mocks.writeWebPairingState).not.toHaveBeenCalled();
  });
});
