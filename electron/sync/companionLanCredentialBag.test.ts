import { beforeEach, expect, it, vi } from 'vitest';

const credentialMock = vi.hoisted(() => ({
  pairedDevice: null as null | { device_secret: string },
  token: null as null | string
}));

vi.mock('./companionPairingStore.js', () => ({
  loadPairedCompanionDevice: vi.fn(() => credentialMock.pairedDevice)
}));
vi.mock('../readwise/readwiseTokenConnector.js', () => ({
  loadReadwiseTokenSecretForCredentialBag: vi.fn(() => credentialMock.token)
}));

beforeEach(() => {
  credentialMock.pairedDevice = { device_secret: 'paired-device-secret' };
  credentialMock.token = 'readwise-token-secret';
});

it('returns an encrypted Readwise credential bag only for paired devices with a saved token', async () => {
  const { loadReadwiseCredentialBag } = await import('./companionLanCredentialBag.js');

  const response = loadReadwiseCredentialBag('device-android');

  expect(response.status).toBe('ready');
  expect(response.credential?.service).toBe('readwise_token');
  expect(JSON.stringify(response)).not.toContain('readwise-token-secret');
});

it('does not return a credential bag when the token is unavailable', async () => {
  credentialMock.token = null;
  const { loadReadwiseCredentialBag } = await import('./companionLanCredentialBag.js');

  expect(loadReadwiseCredentialBag('device-android')).toEqual({
    credential: null,
    status: 'not_available'
  });
});
