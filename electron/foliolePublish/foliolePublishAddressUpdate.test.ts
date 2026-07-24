import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { writeFolioleWebBinding } from '../../lib/core/foliolePublish/folioleWebPublishFrontmatter.js';

const mocks = vi.hoisted(() => ({
  activate: vi.fn(), enqueue: vi.fn(), flush: vi.fn(), loadSettings: vi.fn(),
  loadSnapshot: vi.fn(), mirror: vi.fn(), saveAddress: vi.fn(), upsert: vi.fn()
}));

vi.mock('../../lib/core/database/nodeMutations.js', () => ({ upsertNodeSnapshot: mocks.upsert }));
vi.mock('../database/connection.js', () => ({ openDatabaseConnection: () => ({ driver: {} }) }));
vi.mock('../database/deviceIdentity.js', () => ({ loadOrCreateDesktopDeviceId: () => 'device-1' }));
vi.mock('../database/nodeSyncVersionFromDriver.js', () => ({ flushNodeSyncVersionWithDriver: mocks.flush }));
vi.mock('../database/searchIndexInvalidationCoalescer.js', () => ({ enqueueCoalescedWorkspaceSearchInvalidation: mocks.enqueue }));
vi.mock('../database/transaction.js', () => ({ withTransaction: (_driver: unknown, action: () => unknown) => action() }));
vi.mock('../database/workspaceSnapshot.js', () => ({ loadWorkspaceSnapshot: mocks.loadSnapshot }));
vi.mock('../mirror/mirrorSyncScheduler.js', () => ({ scheduleMirrorSync: mocks.mirror }));
vi.mock('./foliolePublishSettings.js', () => ({
  loadStoredFoliolePublishSettings: mocks.loadSettings,
  saveFoliolePublishSiteAddress: mocks.saveAddress
}));
vi.mock('./foliolePublishSite.js', () => ({ activateFoliolePublishSite: mocks.activate }));

import { commitFoliolePublishAddressUpdate } from './foliolePublishAddressUpdate.js';

let root = '';
const oldContent = writeFolioleWebBinding('# Topic\n\nBody', {
  fields: [], lastPublishedAt: '2026-07-20T00:00:00.000Z', pageId: '1',
  site: 'https://old.example', url: 'https://old.example/topics/1/'
});

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-address-update-'));
  fs.mkdirSync(path.join(root, 'Content'));
  fs.writeFileSync(path.join(root, 'Content', '1.md'), oldContent);
  Object.values(mocks).forEach((mock) => mock.mockReset());
  mocks.loadSettings.mockReturnValue({ site_address: 'https://old.example' });
  mocks.saveAddress.mockImplementation((siteAddress: string) => ({ site_address: siteAddress }));
  mocks.activate.mockReturnValue({ commit: vi.fn(), rollback: vi.fn() });
  mocks.loadSnapshot.mockReturnValue({
    nodesById: {
      'topic-1': {
        anchorLink: null, content: oldContent, createdAt: '2026-07-20T00:00:00.000Z',
        deletedAt: null, hideTitleHeading: false, id: 'topic-1', isTitleManual: true,
        kind: 'topic', parentNodeId: null, reading: null, reveal: null, review: null,
        title: 'Topic', updatedAt: '2026-07-20T00:00:00.000Z'
      }
    }
  });
});

afterEach(() => fs.rmSync(root, { force: true, recursive: true }));

it('rewrites both Publish content and synchronized Topic content before saving the new address', () => {
  const result = commitFoliolePublishAddressUpdate({
    index: {
      next_topic_number: 2,
      site: { title: 'Site' },
      topics: [{
        file: 'Content/1.md', number: 1, published_at: '2026-07-20T00:00:00.000Z', source_key: 'node:topic-1',
        source_node_id: 'topic-1', status: 'published', title: 'Topic',
        updated_at: '2026-07-20T00:00:00.000Z'
      }],
      version: 3
    },
    root,
    siteAddress: 'https://new.example',
    staged: path.join(root, '.staged')
  });

  expect(fs.readFileSync(path.join(root, 'Content', '1.md'), 'utf8')).toContain('https://new.example/topics/1/');
  expect(mocks.upsert).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
    content: expect.stringContaining('https://new.example/topics/1/'),
    deviceId: 'device-1', nodeId: 'topic-1'
  }), expect.anything());
  expect(mocks.flush).toHaveBeenCalledWith(expect.anything(), 'topic-1', 'device-1', expect.any(String));
  expect(result.updatedNodeIds).toEqual(['topic-1']);
});

it('restores the site, Publish content, and previous address if the database write fails', () => {
  const rollback = vi.fn();
  mocks.activate.mockReturnValue({ commit: vi.fn(), rollback });
  mocks.upsert.mockImplementation(() => { throw new Error('Database failed.'); });

  expect(() => commitFoliolePublishAddressUpdate({
    index: {
      next_topic_number: 2,
      site: { title: 'Site' },
      topics: [{
        file: 'Content/1.md', number: 1, published_at: '2026-07-20T00:00:00.000Z', source_key: 'node:topic-1',
        source_node_id: 'topic-1', status: 'published', title: 'Topic',
        updated_at: '2026-07-20T00:00:00.000Z'
      }],
      version: 3
    },
    root, siteAddress: 'https://new.example', staged: path.join(root, '.staged')
  })).toThrow('Database failed.');
  expect(rollback).toHaveBeenCalledOnce();
  expect(fs.readFileSync(path.join(root, 'Content', '1.md'), 'utf8')).toBe(oldContent);
  expect(mocks.saveAddress).toHaveBeenLastCalledWith('https://old.example');
});
