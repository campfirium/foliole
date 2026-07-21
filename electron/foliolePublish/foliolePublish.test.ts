import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { connectFoliolePublishSettings, disconnectFoliolePublishSettings, previewFoliolePublish, publishFoliolePublishThemeChanges, publishTopicToFoliole, updateFoliolePublishLocalPages, updateFoliolePublishSiteAddress, viewFoliolePublishSite } from './foliolePublish.js';
import { emptyPublishIndex } from './foliolePublishModel.js';
import { generateFoliolePublishSite } from './foliolePublishSite.js';

const state = vi.hoisted(() => ({ libraryHome: '' }));
const mocks = vi.hoisted(() => ({
  clearFoliolePublishSettings: vi.fn(),
  deleteCloudflarePagesProject: vi.fn(),
  deployCloudflarePages: vi.fn(),
  detectCloudflarePagesSubdomain: vi.fn(),
  resolveCloudflarePagesProject: vi.fn(),
  recordFoliolePublishFields: vi.fn(),
  shellOpenPath: vi.fn(),
  shellOpenExternal: vi.fn(),
  saveFoliolePublishConnection: vi.fn(),
  saveFoliolePublishSiteAddress: vi.fn()
}));

vi.mock('electron', () => ({ shell: { openExternal: mocks.shellOpenExternal, openPath: mocks.shellOpenPath } }));

vi.mock('../ipc/libraryPaths.js', () => ({
  loadLibraryPathSettingsSync: () => ({ library_home: state.libraryHome })
}));
vi.mock('./cloudflarePagesClient.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('./cloudflarePagesClient.js')>(),
  deployCloudflarePages: mocks.deployCloudflarePages,
  deleteCloudflarePagesProject: mocks.deleteCloudflarePagesProject,
  detectCloudflarePagesSubdomain: mocks.detectCloudflarePagesSubdomain,
  resolveCloudflarePagesProject: mocks.resolveCloudflarePagesProject
}));
vi.mock('./foliolePublishSettings.js', () => ({
  clearFoliolePublishSettings: mocks.clearFoliolePublishSettings,
  forgetFoliolePublishField: vi.fn(),
  loadFoliolePublishSettings: vi.fn(() => ({
    account_id: '', field_catalog: [], has_credentials: false, pages_url: '', project_name: '', site_address: '', updated_at: null
  })),
  loadFoliolePublishToken: vi.fn(() => 'stored-token'),
  loadStoredFoliolePublishSettings: vi.fn(() => ({
    account_id: 'account', pages_url: 'https://site.pages.dev', project_name: 'site',
    site_address: 'https://site.pages.dev', updated_at: '2026-07-19T00:00:00.000Z'
  })),
  recordFoliolePublishFields: mocks.recordFoliolePublishFields,
  resetFoliolePublishFieldHistory: vi.fn(),
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
  mocks.clearFoliolePublishSettings.mockReturnValue({ account_id: '', has_credentials: false, pages_url: '', project_name: '', site_address: '', updated_at: null });
  mocks.deleteCloudflarePagesProject.mockResolvedValue(undefined);
  mocks.detectCloudflarePagesSubdomain.mockResolvedValue(false);
  mocks.resolveCloudflarePagesProject.mockResolvedValue({ created: false, project: { subdomain: 'site.pages.dev' }, status: 'ready' });
  mocks.deployCloudflarePages.mockResolvedValue({ url: 'https://deployment.pages.dev' });
  mocks.shellOpenPath.mockResolvedValue('');
  mocks.shellOpenExternal.mockResolvedValue(undefined);
});
afterEach(() => fs.rmSync(state.libraryHome, { force: true, recursive: true }));

it('returns an explicit conflict without deploying or saving', async () => {
  mocks.resolveCloudflarePagesProject.mockResolvedValue({ status: 'exists' });
  await expect(connectFoliolePublishSettings({
    account_id: 'account', api_token: 'secret', confirm_subdomain_risk: true, project_name: 'site', site_address: ''
  })).resolves.toEqual({ project_name: 'site', status: 'subdomain_unavailable' });
  expect(mocks.deployCloudflarePages).not.toHaveBeenCalled();
  expect(mocks.saveFoliolePublishConnection).not.toHaveBeenCalled();
});

it('keeps the exact active site and settings when staged deployment fails', async () => {
  const before = activeRss();
  mocks.deployCloudflarePages.mockRejectedValue(new Error('deploy failed'));
  const request = connectFoliolePublishSettings({
    account_id: 'account', api_token: 'secret', confirm_subdomain_risk: true, project_name: 'site', site_address: ''
  });
  await expect(request).rejects.toThrow('deploy failed');
  expect(activeRss()).toBe(before);
  expect(mocks.saveFoliolePublishConnection).not.toHaveBeenCalled();
});

it('removes a newly created project when its first deployment fails', async () => {
  mocks.resolveCloudflarePagesProject.mockResolvedValue({
    created: true, project: { subdomain: 'site-random.pages.dev' }, status: 'ready'
  });
  mocks.deployCloudflarePages.mockRejectedValue(new Error('deploy failed'));
  await expect(connectFoliolePublishSettings({
    account_id: 'account', api_token: 'secret', confirm_subdomain_risk: true,
    project_name: 'site', site_address: ''
  })).rejects.toThrow('deploy failed');
  expect(mocks.deleteCloudflarePagesProject).toHaveBeenCalledWith({
    accountId: 'account', projectName: 'site', token: 'secret'
  });
});

it('rolls back the exact active site when connection settings fail to save', async () => {
  const before = activeRss();
  mocks.saveFoliolePublishConnection.mockImplementation(() => { throw new Error('save failed'); });
  const request = connectFoliolePublishSettings({
    account_id: 'account', api_token: 'secret', confirm_subdomain_risk: true, project_name: 'site', site_address: ''
  });
  await expect(request).rejects.toThrow('save failed');
  expect(activeRss()).toBe(before);
});

it('returns the subdomain detection state before creating a project', async () => {
  mocks.detectCloudflarePagesSubdomain.mockResolvedValue(true);
  await expect(connectFoliolePublishSettings({
    account_id: 'account', api_token: 'secret', project_name: 'site', site_address: ''
  })).resolves.toEqual({ project_name: 'site', status: 'subdomain_detected' });
  expect(mocks.resolveCloudflarePagesProject).not.toHaveBeenCalled();
});

it('deletes the Cloudflare project before clearing the local connection', async () => {
  await expect(disconnectFoliolePublishSettings()).resolves.toMatchObject({ has_credentials: false });
  expect(mocks.deleteCloudflarePagesProject).toHaveBeenCalledWith({
    accountId: 'account', projectName: 'site', token: 'stored-token'
  });
  expect(mocks.clearFoliolePublishSettings).toHaveBeenCalledOnce();
});

it('keeps the local connection when Cloudflare project deletion fails', async () => {
  mocks.deleteCloudflarePagesProject.mockRejectedValue(new Error('delete failed'));
  await expect(disconnectFoliolePublishSettings()).rejects.toThrow('delete failed');
  expect(mocks.clearFoliolePublishSettings).not.toHaveBeenCalled();
});

it('updates a custom address with the stored token and rolls back on save failure', async () => {
  const before = activeRss();
  mocks.saveFoliolePublishSiteAddress.mockImplementation(() => { throw new Error('save failed'); });
  await expect(updateFoliolePublishSiteAddress('https://notes.example.com')).rejects.toThrow('save failed');
  expect(activeRss()).toBe(before);
  expect(mocks.deployCloudflarePages).toHaveBeenCalledWith(expect.objectContaining({ token: 'stored-token' }));
});

it('opens only the managed Publish Preview entry without changing the active Site', async () => {
  const before = activeRss();
  const result = await previewFoliolePublish({
    content: '---\ncategory: essays\n---\nPreview body',
    fields: [{ key: 'category', value: 'essays' }], node_id: 'topic-1', title: 'Preview card'
  });
  expect(result.local_path).toBe(path.join(state.libraryHome, 'Publish', 'Preview', 'index.html'));
  expect(mocks.shellOpenPath).toHaveBeenCalledWith(result.local_path);
  expect(activeRss()).toBe(before);
  expect(fs.readFileSync(result.local_path, 'utf8')).toContain('essays');
});

it('opens the active local static pages without regenerating them', async () => {
  const before = activeRss();
  const result = await viewFoliolePublishSite();
  expect(result.local_path).toBe(path.join(state.libraryHome, 'Publish', 'Site', 'index.html'));
  expect(mocks.shellOpenPath).toHaveBeenCalledWith(result.local_path);
  expect(activeRss()).toBe(before);
  expect(fs.existsSync(path.join(state.libraryHome, 'Publish', 'Preview'))).toBe(false);
  expect(fs.readFileSync(result.local_path, 'utf8')).toContain('This is Foliole Publish');
});

it('does not create a preview when local static pages do not exist', async () => {
  fs.rmSync(path.join(state.libraryHome, 'Publish', 'Site'), { force: true, recursive: true });
  await expect(viewFoliolePublishSite()).rejects.toThrow('No local static pages have been generated yet.');
  expect(mocks.shellOpenPath).not.toHaveBeenCalled();
  expect(fs.existsSync(path.join(state.libraryHome, 'Publish', 'Preview'))).toBe(false);
});

it('updates the local static pages with the current theme without deploying', () => {
  const publishRoot = path.join(state.libraryHome, 'Publish');
  fs.writeFileSync(path.join(publishRoot, 'Theme', 'style.css'), 'body { color: rebeccapurple; }');
  const result = updateFoliolePublishLocalPages();
  expect(result.local_path).toBe(path.join(publishRoot, 'Site', 'index.html'));
  expect(fs.readFileSync(path.join(publishRoot, 'Site', 'style.css'), 'utf8')).toBe('body { color: rebeccapurple; }');
  expect(mocks.deployCloudflarePages).not.toHaveBeenCalled();
});

it('publishes theme changes as a complete site without changing Topic records', async () => {
  const publishRoot = path.join(state.libraryHome, 'Publish');
  let deployedStyle = '';
  fs.writeFileSync(path.join(publishRoot, 'Theme', 'style.css'), 'body { color: seagreen; }');
  mocks.deployCloudflarePages.mockImplementation(async ({ siteRoot }: { siteRoot: string }) => {
    deployedStyle = fs.readFileSync(path.join(siteRoot, 'style.css'), 'utf8');
    return { url: 'https://deployment.pages.dev' };
  });
  await expect(publishFoliolePublishThemeChanges()).resolves.toEqual({ local_path: path.join(publishRoot, 'Site', 'index.html') });
  expect(deployedStyle).toBe('body { color: seagreen; }');
  expect(fs.readFileSync(path.join(publishRoot, 'Site', 'style.css'), 'utf8')).toBe(deployedStyle);
  expect(mocks.recordFoliolePublishFields).not.toHaveBeenCalled();
});

it('returns the binding after remote success when the local publish transaction rolls back', async () => {
  const before = activeRss();
  const renameSync = fs.renameSync;
  const rename = vi.spyOn(fs, 'renameSync');
  rename.mockImplementation((from, to) => {
    if (String(to).includes(`${path.sep}Content${path.sep}`)) throw new Error('disk full');
    return renameSync(from, to);
  });
  const result = await publishTopicToFoliole({ content: 'Body', fields: [], node_id: 'topic-1', title: 'Card' });
  rename.mockRestore();
  expect(result.status).toBe('deployed_local_publish_state_failed');
  expect(result.updated_content).toContain('pageId:');
  expect(activeRss()).toBe(before);
  expect(mocks.shellOpenExternal).toHaveBeenCalledWith(result.url);
});

it('keeps all formal local publish state unchanged when deployment fails', async () => {
  const before = activeRss();
  mocks.deployCloudflarePages.mockRejectedValue(new Error('deploy failed'));
  await expect(publishTopicToFoliole({ content: 'Body', fields: [], node_id: 'topic-1', title: 'Card' })).rejects.toThrow('deploy failed');
  expect(activeRss()).toBe(before);
  expect(fs.existsSync(path.join(state.libraryHome, 'Publish', 'Content'))).toBe(false);
  expect(mocks.recordFoliolePublishFields).not.toHaveBeenCalled();
});

it('reports history persistence as an independent partial success', async () => {
  mocks.recordFoliolePublishFields.mockImplementation(() => { throw new Error('settings failed'); });
  const result = await publishTopicToFoliole({ content: 'Body', fields: [{ key: 'category', value: '' }], node_id: 'topic-1', title: 'Card' });
  expect(result.status).toBe('deployed_history_failed');
  expect(result.updated_content).toContain('category: ""');
  expect(fs.existsSync(path.join(state.libraryHome, 'Publish', 'Content'))).toBe(true);
});
