import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getInfo: vi.fn(), isDatabase: vi.fn(), createConnection: vi.fn() }));
vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => 'android' },
  registerPlugin: (name: string) => name === 'App' ? { getInfo: mocks.getInfo } : {}
}));
vi.mock('@capacitor-community/sqlite', () => ({
  SQLiteConnection: class {
    isDatabase = mocks.isDatabase;
    createConnection = mocks.createConnection;
  }
}));

import { mountCapacityAcceptance, runCapacityAcceptance } from './capacityAcceptance';
import { measureCapacityCase } from './capacityAcceptanceMeasure';
import { assertIdentity } from './capacityAcceptanceSafety';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getInfo.mockResolvedValue({ id: 'com.foliole.android.acceptance' });
  mocks.isDatabase.mockResolvedValue({ result: true });
});

it('rejects product app identity before any database call', async () => {
  mocks.getInfo.mockResolvedValue({ id: 'com.foliole.android' });
  await expect(runCapacityAcceptance()).rejects.toThrow('fixed acceptance');
  expect(mocks.isDatabase).not.toHaveBeenCalled();
  expect(mocks.createConnection).not.toHaveBeenCalled();
});

it('never opens or overwrites an existing dedicated database', async () => {
  await expect(runCapacityAcceptance()).rejects.toThrow('already exists');
  expect(mocks.isDatabase).toHaveBeenCalledWith('t219-capacity-1000');
  expect(mocks.createConnection).not.toHaveBeenCalled();
});

it('rejects the main database before executing SQL', async () => {
  const query = vi.fn();
  await expect(measureCapacityCase({ name: 'foliole-companion', port: { query } } as never,
    1000)).rejects.toThrow('dedicated database');
  expect(query).not.toHaveBeenCalled();
});

it('rejects nonempty dedicated databases before any write', async () => {
  const run = vi.fn();
  const query = vi.fn().mockResolvedValue([{ name: 'nodes' }]);
  await expect(measureCapacityCase({ name: 't219-capacity-1000', port: { query, run } } as never,
    1000)).rejects.toThrow('nonempty');
  expect(run).not.toHaveBeenCalled();
});

it.each(['com.foliole.ios', 'com.foliole.ios.t152acceptance'])('refuses unowned iOS identity %s', id => {
  expect(() => assertIdentity('ios', id)).toThrow('fixed acceptance');
});

it('accepts the fixed isolated iOS workspace capacity identity', () => {
  expect(() => assertIdentity('ios', 'com.foliole.ios.t219capacity')).not.toThrow();
});

it('exposes a terminal error through the fixed readable result control', async () => {
  const root = document.createElement('div');
  mountCapacityAcceptance(root);
  const button = root.querySelector('button')!;
  button.click();
  const result = root.querySelector('textarea')!;
  await vi.waitFor(() => expect(result.dataset.status).toBe('failed'));
  expect(JSON.parse(result.value).error).toContain('already exists');
  expect(result.getAttribute('data-result')).toBe(result.value);
  expect(button.disabled).toBe(true);
  expect(result.getAttribute('aria-label')).toBe('T219 capacity result');
});

it('refuses an indeterminate database existence response', async () => {
  mocks.isDatabase.mockResolvedValue({});
  await expect(runCapacityAcceptance()).rejects.toThrow('absence is unverified');
  expect(mocks.createConnection).not.toHaveBeenCalled();
});
