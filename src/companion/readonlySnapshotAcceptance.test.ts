import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getInfo: vi.fn(), isDatabase: vi.fn(), createConnection: vi.fn() }));
vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => 'ios' },
  registerPlugin: () => ({ getInfo: mocks.getInfo })
}));
vi.mock('@capacitor-community/sqlite', () => ({ CapacitorSQLite: {
  isDatabase: mocks.isDatabase, createConnection: mocks.createConnection
} }));

import { mountReadonlySnapshotAcceptance, runReadonlySnapshotAcceptance } from './readonlySnapshotAcceptance';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getInfo.mockResolvedValue({ id: 'com.campfirium.foliole.ios.dev' });
});

it('rejects the production identity before accessing SQLite', async () => {
  mocks.getInfo.mockResolvedValue({ id: 'com.campfirium.foliole.ios' });
  await expect(runReadonlySnapshotAcceptance()).rejects.toThrow('fixed acceptance');
  expect(mocks.isDatabase).not.toHaveBeenCalled();
  expect(mocks.createConnection).not.toHaveBeenCalled();
});

it.each([{ result: true }, {}])('does not open an existing or unverified database %j', async result => {
  mocks.isDatabase.mockResolvedValue(result);
  await expect(runReadonlySnapshotAcceptance()).rejects.toThrow('absence unverified');
  expect(mocks.createConnection).not.toHaveBeenCalled();
  expect(mocks.isDatabase).toHaveBeenCalledWith({ database: expect.stringMatching(/^f1_snapshot_[a-f0-9]{32}$/u) });
});

it('shows progress after clicking and exposes a terminal failure', async () => {
  mocks.isDatabase.mockResolvedValue({ result: true });
  const root = document.createElement('div');
  mountReadonlySnapshotAcceptance(root);
  const button = root.querySelector('button');
  const output = root.querySelector('textarea');
  if (!button || !output) throw new Error('Probe controls missing');
  expect(JSON.parse(output.value).status).toBe('ready');
  button.click();
  expect(button.disabled).toBe(true);
  expect(JSON.parse(output.value)).toEqual({ status: 'running', phase: 'identity' });
  await vi.waitFor(() => expect(JSON.parse(output.value).status).toBe('failed'));
});
