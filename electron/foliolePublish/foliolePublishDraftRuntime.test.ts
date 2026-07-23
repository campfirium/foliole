import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  clearSettings: vi.fn(), deleteProject: vi.fn(), deploy: vi.fn(),
  loadStored: vi.fn(), resolveProject: vi.fn(), saveConnection: vi.fn()
}));

vi.mock('node:fs', () => ({ default: { mkdirSync: vi.fn() } }));
vi.mock('electron', () => ({ shell: { openExternal: vi.fn(), openPath: vi.fn() } }));
vi.mock('../ipc/libraryPaths.js', () => ({
  loadLibraryPathSettingsSync: () => ({ library_home: '/isolated-library' })
}));
vi.mock('./cloudflarePagesClient.js', () => ({
  deleteCloudflarePagesProject: mocks.deleteProject,
  deployCloudflarePages: mocks.deploy,
  normalizeSiteAddress: (value: string) => value,
  resolveCloudflarePagesProject: mocks.resolveProject
}));
vi.mock('./foliolePublishModel.js', () => ({
  readFoliolePublishSiteTitle: vi.fn(() => 'Foliole'),
  readPublishIndex: vi.fn(() => ({ next_topic_number: 1, site: { title: 'Foliole' }, topics: [], version: 2 })),
  saveFoliolePublishSiteTitle: vi.fn(), upsertPublishedTopic: vi.fn(), writeFileAtomic: vi.fn(), writePublishIndex: vi.fn()
}));
vi.mock('./foliolePublishSettings.js', () => ({
  clearFoliolePublishSettings: mocks.clearSettings,
  forgetFoliolePublishField: vi.fn(), loadFoliolePublishSettings: vi.fn(),
  loadFoliolePublishToken: vi.fn(() => 'stored-token'),
  loadStoredFoliolePublishSettings: mocks.loadStored,
  recordFoliolePublishFields: vi.fn(), resetFoliolePublishFieldHistory: vi.fn(),
  saveFoliolePublishConnection: mocks.saveConnection,
  saveFoliolePublishDraft: vi.fn(), saveFoliolePublishSiteAddress: vi.fn()
}));
vi.mock('./foliolePublishSite.js', () => ({
  activateFoliolePublishSite: vi.fn(() => ({ commit: vi.fn(), rollback: vi.fn() })),
  discardStagedFoliolePublishSite: vi.fn(), generateFoliolePublishSite: vi.fn(),
  stageFoliolePublishSite: vi.fn(() => '/staged-site')
}));
vi.mock('./foliolePublishTheme.js', () => ({
  loadFoliolePublishTheme: vi.fn(), prepareFoliolePublishCustomTheme: vi.fn(),
  selectFoliolePublishCustomTheme: vi.fn(), useFoliolePublishOfficialTheme: vi.fn()
}));

import {
  connectFoliolePublishSettings,
  disconnectFoliolePublishSettings,
  publishFoliolePublishThemeChanges,
  updateFoliolePublishSiteAddress
} from './foliolePublish.js';

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset());
  mocks.clearSettings.mockReturnValue({ has_credentials: false });
  mocks.deploy.mockResolvedValue({ url: 'https://deployment.pages.dev' });
  mocks.resolveProject.mockResolvedValue({
    created: false, project: { subdomain: 'site.pages.dev' }, status: 'ready'
  });
});

it('uses the saved draft token when deployment omits a new token', async () => {
  await connectFoliolePublishSettings({
    account_id: 'account', api_token: '', confirm_subdomain_risk: true,
    project_name: 'site', site_address: ''
  });
  expect(mocks.resolveProject).toHaveBeenCalledWith(expect.objectContaining({ token: 'stored-token' }));
  expect(mocks.saveConnection).toHaveBeenCalledWith(
    expect.objectContaining({ api_token: 'stored-token' }), 'https://site.pages.dev'
  );
});

it('does not let an undeployed draft enter connected-only runtime actions', async () => {
  mocks.loadStored.mockReturnValue(null);
  await expect(disconnectFoliolePublishSettings()).resolves.toMatchObject({ has_credentials: false });
  await expect(updateFoliolePublishSiteAddress('https://notes.example.com')).rejects.toThrow('Connect Foliole Publish');
  await expect(publishFoliolePublishThemeChanges()).rejects.toThrow('Connect Foliole Publish');
  expect(mocks.deleteProject).not.toHaveBeenCalled();
  expect(mocks.deploy).not.toHaveBeenCalled();
});
