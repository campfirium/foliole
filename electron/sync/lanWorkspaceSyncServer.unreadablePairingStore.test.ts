import fs from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const electronMock = vi.hoisted(() => ({
  userDataPath: ''
}));
const safeStorageMock = vi.hoisted(() => ({
  decryptString: vi.fn((payload: Buffer) => payload.toString('utf8'))
}));

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => electronMock.userDataPath)
  },
  safeStorage: {
    decryptString: safeStorageMock.decryptString,
    encryptString: vi.fn((payload: string) => Buffer.from(payload, 'utf8')),
    isEncryptionAvailable: vi.fn(() => true)
  }
}));

vi.mock('./companionMdnsAdvertisement.js', () => ({
  startCompanionMdnsAdvertisement: vi.fn(),
  stopCompanionMdnsAdvertisement: vi.fn()
}));

beforeEach(() => {
  electronMock.userDataPath = fs.mkdtempSync(path.join(process.cwd(), '.tmp', 'foliole-companion-pairing-'));
});

afterEach(async () => {
  const { stopLanWorkspaceSyncServer } = await import('./lanWorkspaceSyncServer.js');
  await stopLanWorkspaceSyncServer();
  safeStorageMock.decryptString.mockImplementation((payload: Buffer) => payload.toString('utf8'));
  delete process.env.FOLIOLE_COMPANION_SYNC_PORT;
  fs.rmSync(electronMock.userDataPath, { force: true, recursive: true });
});

it('starts the sync server when the paired-device cache cannot be decrypted', async () => {
  process.env.FOLIOLE_COMPANION_SYNC_PORT = '38683';
  fs.mkdirSync(electronMock.userDataPath, { recursive: true });
  fs.writeFileSync(path.join(electronMock.userDataPath, 'companion-paired-devices.bin'), Buffer.from('stale-ciphertext'));
  safeStorageMock.decryptString.mockImplementation(() => {
    throw new Error('Error while decrypting the ciphertext provided to safeStorage.decryptString.');
  });
  const { ensureLanWorkspaceSyncServer } = await import('./lanWorkspaceSyncServer.js');

  const status = await ensureLanWorkspaceSyncServer({
    appVersion: '0.1.0-test',
    peerId: 'desktop-local'
  });

  expect(status.state).toBe('running');
  expect(status.last_error).toBeNull();
  expect(status.paired_device_count).toBe(0);
});
