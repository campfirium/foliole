import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const electronMock = vi.hoisted(() => ({
  encryptionAvailable: true,
  canRunExternalSources: true,
  userDataPath: `/tmp/foliole-readwise-token-${Math.random().toString(16).slice(2)}`
}));

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => electronMock.userDataPath) },
  safeStorage: {
    decryptString: vi.fn((payload: Buffer) => payload.toString('utf8')),
    encryptString: vi.fn((payload: string) => Buffer.from(payload, 'utf8')),
    isEncryptionAvailable: vi.fn(() => electronMock.encryptionAvailable)
  }
}));
vi.mock('../sync/primaryDeviceState.js', () => ({
  canDesktopRunExternalSources: vi.fn(() => electronMock.canRunExternalSources)
}));

function resetStore() {
  fs.rmSync(electronMock.userDataPath, { force: true, recursive: true });
  electronMock.userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-readwise-token-'));
  electronMock.encryptionAvailable = true;
  electronMock.canRunExternalSources = true;
  vi.stubGlobal('fetch', vi.fn());
}

beforeEach(resetStore);
afterEach(() => {
  vi.unstubAllGlobals();
  fs.rmSync(electronMock.userDataPath, { force: true, recursive: true });
});

it('refuses to save a Readwise token when secure storage is unavailable', async () => {
  electronMock.encryptionAvailable = false;
  const { connectReadwiseToken, loadReadwiseTokenConnection } = await import('./readwiseTokenConnector.js');

  await expect(connectReadwiseToken('token-secret')).resolves.toMatchObject({
    connected: false,
    status: 'storage_unavailable'
  });
  expect(fetch).not.toHaveBeenCalled();
  expect(loadReadwiseTokenConnection().connected).toBe(false);
});

it('refuses to connect Readwise from a secondary desktop role', async () => {
  electronMock.canRunExternalSources = false;
  const { connectReadwiseToken } = await import('./readwiseTokenConnector.js');

  await expect(connectReadwiseToken('token-secret')).resolves.toMatchObject({
    connected: false,
    status: 'not_connected'
  });
  expect(fetch).not.toHaveBeenCalled();
});

it('validates and stores a Readwise token without returning the token', async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 204 }));
  const { connectReadwiseToken, loadReadwiseTokenConnection } = await import('./readwiseTokenConnector.js');

  await expect(connectReadwiseToken(' token-secret ')).resolves.toEqual(expect.objectContaining({
    connected: true,
    status: 'connected'
  }));
  expect(JSON.stringify(await connectReadwiseToken('token-secret'))).not.toContain('token-secret');
  expect(loadReadwiseTokenConnection()).toEqual(expect.objectContaining({
    connected: true,
    status: 'connected'
  }));
});

it('maps Readwise auth failures to reconnect and retry states', async () => {
  const { connectReadwiseToken } = await import('./readwiseTokenConnector.js');
  vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 401 }));
  await expect(connectReadwiseToken('bad-token')).resolves.toMatchObject({ status: 'invalid_token' });

  vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 429 }));
  await expect(connectReadwiseToken('busy-token')).resolves.toMatchObject({ status: 'rate_limited' });
});

it('disconnects by clearing the local token only', async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 204 }));
  const { connectReadwiseToken, disconnectReadwiseToken, loadReadwiseTokenConnection } = await import('./readwiseTokenConnector.js');

  await connectReadwiseToken('token-secret');
  expect(disconnectReadwiseToken()).toMatchObject({ connected: false, status: 'not_connected' });
  expect(loadReadwiseTokenConnection()).toMatchObject({ connected: false, status: 'not_connected' });
});
