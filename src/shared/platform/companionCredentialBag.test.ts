import { beforeEach, expect, it, vi } from 'vitest';

const credentialMock = vi.hoisted(() => ({
  fetchDesktopJson: vi.fn(),
  isNative: vi.fn(() => true),
  saveReadwiseCredentialBag: vi.fn()
}));

vi.mock('./companionDesktopSyncHttp', () => ({
  fetchDesktopJson: credentialMock.fetchDesktopJson
}));
vi.mock('./companionWorkspaceRuntimeRepository', () => ({
  FolioleCompanionSync: {
    saveReadwiseCredentialBag: credentialMock.saveReadwiseCredentialBag
  },
  isNativeAndroidCompanionRuntime: credentialMock.isNative
}));

beforeEach(() => {
  credentialMock.fetchDesktopJson.mockReset();
  credentialMock.isNative.mockReturnValue(true);
  credentialMock.saveReadwiseCredentialBag.mockReset();
});

it('saves a ready Readwise credential bag through the native companion bridge', async () => {
  credentialMock.fetchDesktopJson.mockResolvedValue({
    credential: {
      algorithm: 'HKDF-SHA256-AES-GCM',
      ciphertext: 'ciphertext',
      exported_at: '2026-05-10T00:00:00.000Z',
      iv: 'iv',
      salt: 'salt',
      service: 'readwise_token'
    },
    status: 'ready'
  });
  credentialMock.saveReadwiseCredentialBag.mockResolvedValue({
    checked_at: '2026-05-10T00:00:01.000Z',
    connected: true,
    message: 'Readwise credentials are ready on this device.',
    status: 'connected'
  });
  const { syncReadwiseCredentialBagFromDesktop } = await import('./companionCredentialBag');

  await expect(syncReadwiseCredentialBagFromDesktop('http://10.0.2.2:38641')).resolves.toMatchObject({
    connected: true
  });
  expect(credentialMock.saveReadwiseCredentialBag).toHaveBeenCalledWith(expect.objectContaining({
    service: 'readwise_token'
  }));
});

it('ignores missing or invalid credential bag responses', async () => {
  credentialMock.fetchDesktopJson.mockResolvedValue({ credential: null, status: 'not_available' });
  const { syncReadwiseCredentialBagFromDesktop } = await import('./companionCredentialBag');

  await expect(syncReadwiseCredentialBagFromDesktop('http://10.0.2.2:38641')).resolves.toBeNull();
  expect(credentialMock.saveReadwiseCredentialBag).not.toHaveBeenCalled();
});
