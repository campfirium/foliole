import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getPlatform: vi.fn(() => 'web'),
  isNativePlatform: vi.fn(() => false),
  plugin: {
    clearPairingCredentials: vi.fn(),
    savePrimaryDeviceId: vi.fn()
  },
  normalizePairingState: vi.fn((state: unknown) => state),
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
  normalizePairingState: mocks.normalizePairingState,
  readStoredWebPairingState: mocks.readStoredWebPairingState,
  writeWebPairingState: mocks.writeWebPairingState
}));

import { saveLocalPrimaryDeviceId } from './companionPrimaryDeviceIdentity';
import { clearCompanionPairingCredentials } from './companionWorkspacePairing';

const pairingState = {
  device_id: 'companion-device',
  primary_device_id: 'desktop-old'
};

function useNativePlatform(platform: 'android' | 'ios') {
  mocks.getPlatform.mockReturnValue(platform);
  mocks.isNativePlatform.mockReturnValue(true);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getPlatform.mockReturnValue('web');
  mocks.isNativePlatform.mockReturnValue(false);
  mocks.readStoredWebPairingState.mockReturnValue(pairingState);
  mocks.plugin.savePrimaryDeviceId.mockResolvedValue({
    ...pairingState,
    primary_device_id: 'desktop-new'
  });
  mocks.plugin.clearPairingCredentials.mockResolvedValue({
    device_id: null,
    is_paired: false,
    primary_device_id: null
  });
  mocks.writeWebPairingState.mockImplementation((state) => state);
});

describe('companion primary device identity persistence', () => {
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

  it('serializes an iOS primary-device update with pairing removal', async () => {
    useNativePlatform('ios');
    let finishSave!: () => void;
    mocks.plugin.savePrimaryDeviceId.mockImplementation(() => new Promise((resolve) => {
      finishSave = () => resolve({ ...pairingState, primary_device_id: 'desktop-new' });
    }));

    const save = saveLocalPrimaryDeviceId('desktop-new');
    const clear = clearCompanionPairingCredentials();
    await vi.waitFor(() => expect(mocks.plugin.savePrimaryDeviceId).toHaveBeenCalledOnce());
    expect(mocks.plugin.clearPairingCredentials).not.toHaveBeenCalled();

    finishSave();
    await expect(save).resolves.toMatchObject({ primary_device_id: 'desktop-new' });
    await expect(clear).resolves.toMatchObject({ is_paired: false });
    expect(mocks.plugin.clearPairingCredentials).toHaveBeenCalledOnce();
  });
});
