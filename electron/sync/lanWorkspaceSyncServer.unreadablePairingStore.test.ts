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
    getSelectedStorageBackend: vi.fn(() => 'gnome_libsecret'),
    isEncryptionAvailable: vi.fn(() => true)
  }
}));

vi.mock('./companionMdnsAdvertisement.js', () => ({
  startCompanionMdnsAdvertisement: vi.fn(),
  stopCompanionMdnsAdvertisement: vi.fn()
}));

vi.mock('../database/syncGroupStore.js', () => ({ loadDesktopSyncGroup: vi.fn(() => null) }));

beforeEach(() => {
  electronMock.userDataPath = fs.mkdtempSync(path.join(process.cwd(), '.tmp', 'foliole-companion-pairing-'));
});

afterEach(async () => {
  safeStorageMock.decryptString.mockImplementation((payload: Buffer) => payload.toString('utf8'));
  fs.rmSync(electronMock.userDataPath, { force: true, recursive: true });
});

it('keeps the sync server request boundary available when the paired-device cache cannot be decrypted', async () => {
  fs.mkdirSync(electronMock.userDataPath, { recursive: true });
  fs.writeFileSync(path.join(electronMock.userDataPath, 'companion-paired-devices.bin'), Buffer.from('stale-ciphertext'));
  safeStorageMock.decryptString.mockImplementation(() => {
    throw new Error('Error while decrypting the ciphertext provided to safeStorage.decryptString.');
  });
  const { createWorkspaceSyncHttpServer, getLanWorkspaceSyncServerStatus } = await import('./lanWorkspaceSyncServer.js');
  const server = createWorkspaceSyncHttpServer({
    appVersion: '0.1.0-test',
    peerId: 'desktop-local'
  });
  const status = getLanWorkspaceSyncServerStatus();
  getLanWorkspaceSyncServerStatus();
  getLanWorkspaceSyncServerStatus();

  expect(server.listenerCount('request')).toBe(1);
  expect(status.paired_authorization_count).toBe(0);
  expect(safeStorageMock.decryptString).not.toHaveBeenCalled();
});
