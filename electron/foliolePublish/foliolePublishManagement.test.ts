import { beforeEach, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => ({ queryAll: vi.fn() }));
const modelMocks = vi.hoisted(() => ({
  markTopicsUnpublishedBySourceKeys: vi.fn(),
  readPublishIndex: vi.fn(),
  writePublishIndex: vi.fn()
}));
const siteMocks = vi.hoisted(() => ({
  activateFoliolePublishSite: vi.fn(),
  discardStagedFoliolePublishSite: vi.fn(),
  stageFoliolePublishSite: vi.fn()
}));
const cloudflareMocks = vi.hoisted(() => ({ deployCloudflarePages: vi.fn() }));
const settingsMocks = vi.hoisted(() => ({
  loadFoliolePublishToken: vi.fn(),
  loadStoredFoliolePublishSettings: vi.fn()
}));

vi.mock('../database/connection.js', () => ({
  openDatabaseConnection: () => ({ driver: { queryAll: dbMocks.queryAll } })
}));
vi.mock('../ipc/libraryPaths.js', () => ({
  loadLibraryPathSettingsSync: () => ({ library_home: '/library' })
}));
vi.mock('./cloudflarePagesClient.js', () => cloudflareMocks);
vi.mock('./foliolePublishModel.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('./foliolePublishModel.js')>(),
  ...modelMocks
}));
vi.mock('./foliolePublishSettings.js', () => settingsMocks);
vi.mock('./foliolePublishSite.js', () => siteMocks);

import {
  inspectFoliolePublishedDelete,
  unpublishFolioleTopics
} from './foliolePublishManagement.js';

const PUBLISHED_INDEX = {
  next_topic_number: 2,
  site: { title: 'Site' },
  topics: [{
    file: 'Content/1.md', number: 1, published_at: '2026-07-24T00:00:00.000Z',
    source_key: 'node:topic-1', source_node_id: 'topic-1', status: 'published',
    title: 'Topic 1', updated_at: '2026-07-24T00:00:00.000Z', fields: []
  }],
  version: 3
};

beforeEach(() => {
  [...Object.values(modelMocks), ...Object.values(siteMocks), ...Object.values(cloudflareMocks),
    ...Object.values(settingsMocks), dbMocks.queryAll].forEach((mock) => mock.mockReset());
  modelMocks.readPublishIndex.mockReturnValue(PUBLISHED_INDEX);
  dbMocks.queryAll.mockReturnValue([{ id: 'folder-1' }, { id: 'topic-1' }]);
});

it('finds published Topics inside a requested folder subtree before deletion', () => {
  expect(inspectFoliolePublishedDelete(['folder-1'])).toEqual({
    published_node_ids: ['topic-1'],
    source_keys: ['node:topic-1'],
    status: 'requires_unpublish'
  });
  expect(dbMocks.queryAll.mock.calls[0]?.[0]).toContain('WITH RECURSIVE');
});

it('does not change local publish state when remote deployment fails', async () => {
  settingsMocks.loadStoredFoliolePublishSettings.mockReturnValue({
    account_id: 'account', project_name: 'project', site_address: 'https://example.com'
  });
  settingsMocks.loadFoliolePublishToken.mockReturnValue('token');
  modelMocks.markTopicsUnpublishedBySourceKeys.mockReturnValue({ ...PUBLISHED_INDEX, topics: [] });
  siteMocks.stageFoliolePublishSite.mockReturnValue('/staged');
  cloudflareMocks.deployCloudflarePages.mockRejectedValue(new Error('Deploy failed.'));

  await expect(unpublishFolioleTopics(['node:topic-1'])).rejects.toThrow('Deploy failed.');
  expect(modelMocks.writePublishIndex).not.toHaveBeenCalled();
  expect(siteMocks.activateFoliolePublishSite).not.toHaveBeenCalled();
  expect(siteMocks.discardStagedFoliolePublishSite).toHaveBeenCalledWith('/staged');
});

it('reports a deployed-but-uncommitted state and rolls back local activation', async () => {
  const commit = vi.fn();
  const rollback = vi.fn();
  settingsMocks.loadStoredFoliolePublishSettings.mockReturnValue({
    account_id: 'account', project_name: 'project', site_address: 'https://example.com'
  });
  settingsMocks.loadFoliolePublishToken.mockReturnValue('token');
  modelMocks.markTopicsUnpublishedBySourceKeys.mockReturnValue({ ...PUBLISHED_INDEX, topics: [] });
  modelMocks.writePublishIndex.mockImplementation(() => { throw new Error('Local commit failed.'); });
  siteMocks.stageFoliolePublishSite.mockReturnValue('/staged');
  siteMocks.activateFoliolePublishSite.mockReturnValue({ commit, rollback });

  await expect(unpublishFolioleTopics(['node:topic-1'])).resolves.toEqual({
    status: 'deployed_local_unpublish_state_failed', warning: 'Local commit failed.'
  });
  expect(rollback).toHaveBeenCalledOnce();
  expect(commit).not.toHaveBeenCalled();
});
