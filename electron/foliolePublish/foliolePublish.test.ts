import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { connectFoliolePublishSettings, updateFoliolePublishSiteAddress } from './foliolePublish.js';
import { emptyPublishIndex } from './foliolePublishModel.js';
import { generateFoliolePublishSite } from './foliolePublishSite.js';

const state = vi.hoisted(() => ({ libraryHome: '' }));
const mocks = vi.hoisted(() => ({
  deployCloudflarePages: vi.fn(),
  resolveCloudflarePagesProject: vi.fn(),
  saveFoliolePublishConnection: vi.fn(),
  saveFoliolePublishSiteAddress: vi.fn()
}));

vi.mock('../ipc/libraryPaths.js', () => ({
  loadLibraryPathSettingsSync: () => ({ library_home: state.libraryHome })
}));
vi.mock('./cloudflarePagesClient.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('./cloudflarePagesClient.js')>(),
  deployCloudflarePages: mocks.deployCloudflarePages,
  resolveCloudflarePagesProject: mocks.resolveCloudflarePagesProject
}));
vi.mock('./foliolePublishSettings.js', () => ({
  disconnectFoliolePublishSettings: vi.fn(),
  loadFoliolePublishSettings: vi.fn(),
  loadFoliolePublishToken: vi.fn(() => 'stored-token'),
  loadStoredFoliolePublishSettings: vi.fn(() => ({
    account_id: 'account', pages_url: 'https://site.pages.dev', project_name: 'site',
    site_address: 'https://site.pages.dev', updated_at: '2026-07-19T00:00:00.000Z'
  })),
  saveFoliolePublishConnection: mocks.saveFoliolePublishConnection,
  saveFoliolePublishSiteAddress: mocks.saveFoliolePublishSiteAddress
}));

function activeRss() {
  return fs.readFileSync(path.join(state.libraryHome, 'Publish', 'Site', 'rss.xml'), 'utf8');
}

beforeEach(() => {
  state.libraryHome = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-publish-runtime-'));
  fs.mkdirSync(path.join(state.libraryHome, 'Publish'), { recursive: true });
  generateFoliolePublishSite(path.join(state.libraryHome, 'Publish'), emptyPublishIndex(), 'https://old.pages.dev');
  Object.values(mocks).forEach((mock) => mock.mockReset());
  mocks.resolveCloudflarePagesProject.mockResolvedValue({ project: { subdomain: 'site.pages.dev' }, status: 'ready' });
  mocks.deployCloudflarePages.mockResolvedValue({ url: 'https://deployment.pages.dev' });
});
afterEach(() => fs.rmSync(state.libraryHome, { force: true, recursive: true }));

it('returns an explicit conflict without deploying or saving', async () => {
  mocks.resolveCloudflarePagesProject.mockResolvedValue({ status: 'exists' });
  await expect(connectFoliolePublishSettings({
    account_id: 'account', api_token: 'secret', project_name: 'site', site_address: '', use_existing_project: false
  })).resolves.toEqual({ project_name: 'site', status: 'project_exists' });
  expect(mocks.deployCloudflarePages).not.toHaveBeenCalled();
  expect(mocks.saveFoliolePublishConnection).not.toHaveBeenCalled();
});

it('keeps the exact active site and settings when staged deployment fails', async () => {
  const before = activeRss();
  mocks.deployCloudflarePages.mockRejectedValue(new Error('deploy failed'));
  const request = connectFoliolePublishSettings({
    account_id: 'account', api_token: 'secret', project_name: 'site', site_address: '', use_existing_project: false
  });
  await expect(request).rejects.toThrow('deploy failed');
  expect(activeRss()).toBe(before);
  expect(mocks.saveFoliolePublishConnection).not.toHaveBeenCalled();
});

it('rolls back the exact active site when connection settings fail to save', async () => {
  const before = activeRss();
  mocks.saveFoliolePublishConnection.mockImplementation(() => { throw new Error('save failed'); });
  const request = connectFoliolePublishSettings({
    account_id: 'account', api_token: 'secret', project_name: 'site', site_address: '', use_existing_project: true
  });
  await expect(request).rejects.toThrow('save failed');
  expect(activeRss()).toBe(before);
});

it('updates a custom address with the stored token and rolls back on save failure', async () => {
  const before = activeRss();
  mocks.saveFoliolePublishSiteAddress.mockImplementation(() => { throw new Error('save failed'); });
  await expect(updateFoliolePublishSiteAddress('https://notes.example.com')).rejects.toThrow('save failed');
  expect(activeRss()).toBe(before);
  expect(mocks.deployCloudflarePages).toHaveBeenCalledWith(expect.objectContaining({ token: 'stored-token' }));
});
