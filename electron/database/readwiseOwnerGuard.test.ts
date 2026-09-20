import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let root = '';
let dbPath = '/library/one.db';
vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({ app_config_dir: path.join(root, 'config') })
}));
vi.mock('./connection.js', () => ({
  openDatabaseConnection: () => ({ dbPath })
}));

import { loadReadwiseOwnerGuard, saveReadwiseOwnerGuard } from './readwiseOwnerGuard.js';

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-guard-'));
  dbPath = '/library/one.db';
});
afterEach(async () => { await fs.rm(root, { recursive: true, force: true }); });

it('keeps relinquishment outside a restored library and separates library identities', () => {
  expect(loadReadwiseOwnerGuard('group')).toBeNull();
  saveReadwiseOwnerGuard({ epoch: 2, groupId: 'group', mode: 'api',
    ownerId: 'old-device', state: 'active', targetId: null });
  saveReadwiseOwnerGuard({ epoch: 2, groupId: 'group', mode: 'api',
    ownerId: 'old-device', state: 'relinquished', targetId: 'new-device' });
  dbPath = '/library/restored-elsewhere.db';
  expect(loadReadwiseOwnerGuard('group')).toBeNull();
  dbPath = '/library/one.db';
  expect(loadReadwiseOwnerGuard('group')).toMatchObject({
    epoch: 2, ownerId: 'old-device', state: 'relinquished', targetId: 'new-device'
  });
});

it('rejects a corrupt registry instead of recreating an active guard', async () => {
  await fs.mkdir(path.join(root, 'config'));
  await fs.writeFile(path.join(root, 'config', 'readwise-owner-guard-v1.json'), '{invalid');
  expect(() => loadReadwiseOwnerGuard('group')).toThrow('readwise_owner_guard_invalid');
  expect(() => saveReadwiseOwnerGuard({ epoch: 1, groupId: 'group', mode: 'api',
    ownerId: 'new-device', state: 'active', targetId: null })).toThrow('readwise_owner_guard_invalid');
});

it('does not overwrite a newer local checkpoint with a rolled-back epoch', () => {
  saveReadwiseOwnerGuard({ epoch: 4, groupId: 'group', mode: 'relay',
    ownerId: 'old-device', state: 'relinquished', targetId: 'new-device' });
  expect(() => saveReadwiseOwnerGuard({ epoch: 2, groupId: 'group', mode: 'relay',
    ownerId: 'old-device', state: 'active', targetId: null }))
    .toThrow('readwise_owner_guard_epoch_regressed');
  expect(loadReadwiseOwnerGuard('group')).toMatchObject({ epoch: 4, state: 'relinquished' });
});
