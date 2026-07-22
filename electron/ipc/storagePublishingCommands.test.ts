import { beforeEach, expect, it, vi } from 'vitest';

import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';

const discourseMocks = vi.hoisted(() => ({
  beginDiscourseUserApiAuthorization: vi.fn(),
  completeDiscourseUserApiAuthorization: vi.fn(),
  disconnectDiscoursePublishSettings: vi.fn(),
  loadDiscoursePublishCatalog: vi.fn(),
  loadDiscoursePublishDraft: vi.fn(),
  loadDiscoursePublishSettings: vi.fn(),
  publishTopicToDiscourse: vi.fn(),
  saveDiscoursePublishDraft: vi.fn(),
  saveDiscoursePublishSettings: vi.fn()
}));
const wordpressMocks = vi.hoisted(() => ({
  connectWordPressPublishSettings: vi.fn(),
  disconnectWordPressPublishSettings: vi.fn(),
  loadWordPressPublishSettings: vi.fn(),
  publishTopicToWordPress: vi.fn()
}));
const folioleMocks = vi.hoisted(() => ({
  connectFoliolePublishSettings: vi.fn(),
  disconnectFoliolePublishSettings: vi.fn(),
  forgetFoliolePublishField: vi.fn(),
  loadFoliolePublishSettings: vi.fn(),
  openFoliolePublishTheme: vi.fn(),
  previewFoliolePublish: vi.fn(),
  publishFoliolePublishThemeChanges: vi.fn(),
  publishTopicToFoliole: vi.fn(),
  resetFoliolePublishFieldHistory: vi.fn(),
  resetFoliolePublishTheme: vi.fn(),
  saveFoliolePublishDraft: vi.fn(),
  updateFoliolePublishLocalPages: vi.fn(),
  updateFoliolePublishSiteAddress: vi.fn(),
  viewFoliolePublishSite: vi.fn()
}));

vi.mock('../discourse/discoursePublish.js', () => discourseMocks);
vi.mock('../foliolePublish/foliolePublish.js', () => folioleMocks);
vi.mock('../wordpress/wordpressPublish.js', () => wordpressMocks);

import { handlePublishingStorageCommand } from './storagePublishingCommands.js';

beforeEach(() => {
  Object.values(discourseMocks).forEach((mock) => mock.mockReset());
  Object.values(folioleMocks).forEach((mock) => mock.mockReset());
  Object.values(wordpressMocks).forEach((mock) => mock.mockReset());
});

it('keeps the Cloudflare API token inside the main-process connection boundary', async () => {
  const settings = { account_id: 'account', api_token: 'SENTINEL-CLOUDFLARE-SECRET', project_name: 'foliole', site_address: '' };
  folioleMocks.connectFoliolePublishSettings.mockResolvedValue({
    settings: {
      account_id: 'account', has_credentials: true, pages_url: 'https://foliole.pages.dev',
      project_name: 'foliole', site_address: 'https://foliole.pages.dev', updated_at: '2026-07-16T00:00:00.000Z'
    },
    status: 'connected'
  });

  const result = await handlePublishingStorageCommand(NATIVE_COMMANDS.connectFoliolePublishSettings, { settings });

  expect(folioleMocks.connectFoliolePublishSettings).toHaveBeenCalledWith(settings);
  expect(JSON.stringify(result)).not.toContain('SENTINEL-CLOUDFLARE-SECRET');
});

it('routes the Foliole Publish draft without returning its Cloudflare token', async () => {
  const settings = { account_id: 'account', api_token: 'SENTINEL-DRAFT-SECRET', project_name: 'foliole' };
  folioleMocks.saveFoliolePublishDraft.mockReturnValue({
    account_id: 'account', credentials_valid: true, field_catalog: [], has_credentials: true,
    pages_url: '', project_name: 'foliole', site_address: '', updated_at: '2026-07-22T00:00:00.000Z'
  });

  const result = await handlePublishingStorageCommand(NATIVE_COMMANDS.saveFoliolePublishDraft, { settings });

  expect(folioleMocks.saveFoliolePublishDraft).toHaveBeenCalledWith(settings);
  expect(JSON.stringify(result)).not.toContain('SENTINEL-DRAFT-SECRET');
});

it('updates the public address without accepting a renderer credential', async () => {
  folioleMocks.updateFoliolePublishSiteAddress.mockResolvedValue({
    account_id: 'account', has_credentials: true, pages_url: 'https://foliole.pages.dev',
    project_name: 'foliole', site_address: 'https://notes.example.com', updated_at: '2026-07-19T00:00:00.000Z'
  });
  const result = await handlePublishingStorageCommand(NATIVE_COMMANDS.updateFoliolePublishSiteAddress, {
    api_token: 'SENTINEL-MUST-BE-IGNORED', site_address: 'https://notes.example.com'
  });
  expect(folioleMocks.updateFoliolePublishSiteAddress).toHaveBeenCalledWith('https://notes.example.com');
  expect(JSON.stringify(result)).not.toContain('SENTINEL-MUST-BE-IGNORED');
});

it('routes Web Publish field history and theme actions through narrow commands', async () => {
  await handlePublishingStorageCommand(NATIVE_COMMANDS.forgetFoliolePublishField, { key: 'category' });
  await handlePublishingStorageCommand(NATIVE_COMMANDS.resetFoliolePublishFieldHistory, {});
  await handlePublishingStorageCommand(NATIVE_COMMANDS.openFoliolePublishTheme, {});
  await handlePublishingStorageCommand(NATIVE_COMMANDS.resetFoliolePublishTheme, {});
  await handlePublishingStorageCommand(NATIVE_COMMANDS.updateFoliolePublishLocalPages, {});
  await handlePublishingStorageCommand(NATIVE_COMMANDS.publishFoliolePublishThemeChanges, {});
  expect(folioleMocks.forgetFoliolePublishField).toHaveBeenCalledWith('category');
  expect(folioleMocks.resetFoliolePublishFieldHistory).toHaveBeenCalledOnce();
  expect(folioleMocks.openFoliolePublishTheme).toHaveBeenCalledOnce();
  expect(folioleMocks.resetFoliolePublishTheme).toHaveBeenCalledOnce();
  expect(folioleMocks.updateFoliolePublishLocalPages).toHaveBeenCalledOnce();
  expect(folioleMocks.publishFoliolePublishThemeChanges).toHaveBeenCalledOnce();
});

it('routes viewing the local static pages without Topic payload data', async () => {
  await handlePublishingStorageCommand(NATIVE_COMMANDS.previewFoliolePublishSite, {});
  expect(folioleMocks.viewFoliolePublishSite).toHaveBeenCalledOnce();
  expect(folioleMocks.previewFoliolePublish).not.toHaveBeenCalled();
});

it('forwards nested WordPress connection settings only to the main-process connector', async () => {
  const settings = {
    application_password: 'SENTINEL-WORDPRESS-SECRET',
    site_url: 'https://free-site.wordpress.com',
    username: 'writer'
  };
  wordpressMocks.connectWordPressPublishSettings.mockResolvedValue({
    adapter: 'wordpress_com_xmlrpc', has_credentials: true,
    site_url: settings.site_url, updated_at: '2026-07-16T00:00:00.000Z'
  });

  const result = await handlePublishingStorageCommand(
    NATIVE_COMMANDS.connectWordPressPublishSettings,
    { settings }
  );
  expect(wordpressMocks.connectWordPressPublishSettings).toHaveBeenCalledWith(settings);
  expect(JSON.stringify(result)).not.toContain('SENTINEL-WORDPRESS-SECRET');
});

it('forwards WordPress publish content without adding credentials to the payload', async () => {
  const args = { content: '# Title\n\nBody', status: 'draft', title: 'Title' };
  await handlePublishingStorageCommand(NATIVE_COMMANDS.publishTopicToWordPress, args);
  expect(wordpressMocks.publishTopicToWordPress).toHaveBeenCalledWith(args);
});

it('routes explicit Discourse disconnect through the credential owner', async () => {
  await handlePublishingStorageCommand(NATIVE_COMMANDS.disconnectDiscoursePublishSettings, {});
  expect(discourseMocks.disconnectDiscoursePublishSettings).toHaveBeenCalledOnce();
});

it('routes Discourse Topic drafts through the device publishing setting owner', async () => {
  const draft = { category_id: 7, tags: ['foliole'] };
  await handlePublishingStorageCommand(NATIVE_COMMANDS.loadDiscoursePublishDraft, { node_id: 'topic-1' });
  await handlePublishingStorageCommand(NATIVE_COMMANDS.saveDiscoursePublishDraft, { draft, node_id: 'topic-1' });

  expect(discourseMocks.loadDiscoursePublishDraft).toHaveBeenCalledWith('topic-1');
  expect(discourseMocks.saveDiscoursePublishDraft).toHaveBeenCalledWith({ draft, node_id: 'topic-1' });
});

it('keeps the decrypted User API key inside the main-process authorization boundary', async () => {
  discourseMocks.completeDiscourseUserApiAuthorization.mockReturnValue({
    has_api_key: true,
    site_url: 'https://forum.example.com',
    updated_at: '2026-07-19T00:00:00.000Z'
  });
  const args = { payload: 'ENCRYPTED-AUTHORIZATION-RESULT', site_url: 'https://forum.example.com' };
  const result = await handlePublishingStorageCommand(NATIVE_COMMANDS.completeDiscourseUserApiAuthorization, args);
  expect(discourseMocks.completeDiscourseUserApiAuthorization).toHaveBeenCalledWith(args);
  expect(JSON.stringify(result)).not.toContain(args.payload);
});
