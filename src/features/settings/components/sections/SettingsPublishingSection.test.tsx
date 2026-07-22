import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../../../../shared/localization/testLocalization';

import { SettingsPublishingSection } from './SettingsPublishingSection';

const repositoryMocks = vi.hoisted(() => ({
  beginDiscourseUserApiAuthorizationFromRuntime: vi.fn(),
  completeDiscourseUserApiAuthorizationFromRuntime: vi.fn(),
  disconnectDiscoursePublishSettingsFromRuntime: vi.fn(),
  loadDiscoursePublishCatalogFromRuntime: vi.fn(),
  loadDiscoursePublishSettingsFromRuntime: vi.fn(),
  saveDiscoursePublishSettingsToRuntime: vi.fn()
}));

const wordpressRepositoryMocks = vi.hoisted(() => ({
  connectWordPressPublishSettingsToRuntime: vi.fn(),
  disconnectWordPressPublishSettingsFromRuntime: vi.fn(),
  loadWordPressPublishSettingsFromRuntime: vi.fn()
}));
const folioleRepositoryMocks = vi.hoisted(() => ({
  connectFoliolePublishSettingsToRuntime: vi.fn(),
  disconnectFoliolePublishSettingsFromRuntime: vi.fn(),
  loadFoliolePublishSettingsFromRuntime: vi.fn(),
  openFoliolePublishThemeFromRuntime: vi.fn(),
  publishFoliolePublishThemeChangesFromRuntime: vi.fn(),
  resetFoliolePublishThemeFromRuntime: vi.fn(),
  saveFoliolePublishDraftToRuntime: vi.fn(),
  updateFoliolePublishLocalPagesFromRuntime: vi.fn(),
  viewFoliolePublishSiteFromRuntime: vi.fn(),
  updateFoliolePublishSiteAddressInRuntime: vi.fn()
}));

vi.mock('../../../../shared/platform/discoursePublishRepository', () => repositoryMocks);
vi.mock('../../../../shared/platform/foliolePublishRepository', () => folioleRepositoryMocks);
vi.mock('../../../../shared/platform/wordpressPublishRepository', () => wordpressRepositoryMocks);

const SAVED_SETTINGS = {
  has_api_key: true,
  site_url: 'https://forum.example.com',
  updated_at: null
};

beforeEach(() => {
  window.localStorage.clear();
  repositoryMocks.loadDiscoursePublishSettingsFromRuntime.mockReset();
  repositoryMocks.disconnectDiscoursePublishSettingsFromRuntime.mockReset();
  repositoryMocks.loadDiscoursePublishCatalogFromRuntime.mockReset();
  repositoryMocks.saveDiscoursePublishSettingsToRuntime.mockReset();
  repositoryMocks.loadDiscoursePublishSettingsFromRuntime.mockResolvedValue(SAVED_SETTINGS);
  repositoryMocks.disconnectDiscoursePublishSettingsFromRuntime.mockResolvedValue({
    has_api_key: false, site_url: '', updated_at: null
  });
  repositoryMocks.saveDiscoursePublishSettingsToRuntime.mockImplementation(async (input: { api_key?: string; site_url: string }) => ({
    ...SAVED_SETTINGS,
    site_url: input.site_url
  }));
  repositoryMocks.loadDiscoursePublishCatalogFromRuntime.mockResolvedValue({
    categories: [],
    fetched_at: null,
    from_cache: false,
    recent_category_ids: [],
    recent_tags: [],
    tags: []
  });
  wordpressRepositoryMocks.connectWordPressPublishSettingsToRuntime.mockReset();
  wordpressRepositoryMocks.disconnectWordPressPublishSettingsFromRuntime.mockReset();
  wordpressRepositoryMocks.loadWordPressPublishSettingsFromRuntime.mockReset();
  wordpressRepositoryMocks.loadWordPressPublishSettingsFromRuntime.mockResolvedValue({
    adapter: null, has_credentials: false, site_url: '', updated_at: null
  });
  wordpressRepositoryMocks.connectWordPressPublishSettingsToRuntime.mockResolvedValue({
    adapter: 'wordpress_com_xmlrpc', has_credentials: true,
    site_url: 'https://free-site.wordpress.com', updated_at: '2026-07-16T00:00:00.000Z'
  });
  Object.values(folioleRepositoryMocks).forEach((mock) => mock.mockReset());
  folioleRepositoryMocks.loadFoliolePublishSettingsFromRuntime.mockResolvedValue({
    account_id: '', credentials_valid: false, field_catalog: [], has_credentials: false,
    pages_url: '', project_name: '', site_address: '', updated_at: null
  });
  folioleRepositoryMocks.saveFoliolePublishDraftToRuntime.mockImplementation(async (input: {
    account_id: string; api_token: string; project_name: string;
  }) => ({
    account_id: input.account_id, credentials_valid: Boolean(input.api_token), field_catalog: [],
    has_credentials: Boolean(input.api_token), pages_url: '', project_name: input.project_name,
    site_address: '', updated_at: '2026-07-22T00:00:00.000Z'
  }));
  folioleRepositoryMocks.viewFoliolePublishSiteFromRuntime.mockResolvedValue({ local_path: '/Publish/Site/index.html', url: null });
  folioleRepositoryMocks.connectFoliolePublishSettingsToRuntime.mockResolvedValue({
    settings: {
      account_id: 'account', credentials_valid: true, field_catalog: [], has_credentials: true, pages_url: 'https://my-notes.pages.dev',
      project_name: 'my-notes', site_address: 'https://my-notes.pages.dev', updated_at: '2026-07-16T00:00:00.000Z'
    },
    status: 'connected'
  });
});

it('starts collapsed and restores independent disclosure state after remounting', () => {
  const first = renderWithLocalization(<SettingsPublishingSection />);
  const foliole = screen.getByRole('button', { name: 'Publish to the site' });
  const wordpress = screen.getByRole('button', { name: 'Publish to WordPress' });
  const discourse = screen.getByRole('button', { name: 'Publish to Discourse' });
  expect([foliole, wordpress, discourse].map((button) => button.getAttribute('aria-expanded'))).toEqual(['false', 'false', 'false']);

  fireEvent.click(wordpress);
  expect(wordpress).toHaveAttribute('aria-expanded', 'true');
  expect(foliole).toHaveAttribute('aria-expanded', 'false');
  expect(discourse).toHaveAttribute('aria-expanded', 'false');

  first.unmount();
  renderWithLocalization(<SettingsPublishingSection />);
  expect(screen.getByRole('button', { name: 'Publish to WordPress' })).toHaveAttribute('aria-expanded', 'true');
});

it('opens the local static pages from the visible Publish settings row', async () => {
  renderWithLocalization(<SettingsPublishingSection />);
  fireEvent.click(screen.getByRole('button', { name: 'Publish to the site' }));
  fireEvent.click(await screen.findByRole('button', { name: 'View local' }));

  await waitFor(() => expect(folioleRepositoryMocks.viewFoliolePublishSiteFromRuntime).toHaveBeenCalledOnce());
});

it('uses concise Publish copy and the standard settings input width', async () => {
  renderWithLocalization(<SettingsPublishingSection />);
  fireEvent.click(screen.getByRole('button', { name: 'Publish to Discourse' }));

  const forumUrl = await screen.findByLabelText('Discourse forum URL');
  const headings = screen.getAllByRole('heading', { level: 3 });
  expect(headings).toHaveLength(3);
  expect(screen.getByRole('heading', { level: 3, name: 'Publish to the site' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { level: 3, name: 'Publish to WordPress' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { level: 3, name: 'Publish to Discourse' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Discourse forum' })).toBeNull();
  expect(screen.getByText('Enter forum address')).toBeInTheDocument();
  expect(screen.getByText('Get authorization')).toBeInTheDocument();
  expect(screen.getByText('Get authorization').parentElement?.parentElement).toHaveClass('grid-cols-[minmax(0,1fr)_minmax(0,420px)]');
  expect(screen.getByText('Discourse connection')).toBeInTheDocument();
  expect(screen.getByText('Connected')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Test access' })).toBeNull();
  expect(forumUrl.parentElement).toHaveClass('w-full');
});

it('disconnects Discourse and removes the saved credential state', async () => {
  renderWithLocalization(<SettingsPublishingSection />);
  fireEvent.click(screen.getByRole('button', { name: 'Publish to Discourse' }));
  const disconnect = await screen.findByRole('button', { name: 'Disconnect' });
  fireEvent.click(disconnect);

  await waitFor(() => expect(repositoryMocks.disconnectDiscoursePublishSettingsFromRuntime).toHaveBeenCalledOnce());
  const discourse = screen.getByRole('region', { name: 'Discourse publish settings' });
  expect(within(discourse).getByText('Not connected')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Disconnect' })).toBeNull();
});

it('saves the forum URL silently after blur or Enter', async () => {
  repositoryMocks.loadDiscoursePublishSettingsFromRuntime.mockResolvedValue({
    has_api_key: false, site_url: 'https://forum.example.com', updated_at: null
  });
  renderWithLocalization(<SettingsPublishingSection />);
  const forumUrl = await screen.findByLabelText('Discourse forum URL');

  fireEvent.change(forumUrl, { target: { value: 'https://community.example.com' } });
  expect(repositoryMocks.saveDiscoursePublishSettingsToRuntime).not.toHaveBeenCalled();
  fireEvent.blur(forumUrl);

  await waitFor(() => expect(repositoryMocks.saveDiscoursePublishSettingsToRuntime).toHaveBeenCalledWith({
    site_url: 'https://community.example.com'
  }));
  fireEvent.change(forumUrl, { target: { value: 'https://talk.example.com' } });
  fireEvent.focus(forumUrl);
  fireEvent.keyDown(forumUrl, { key: 'Enter' });
  await waitFor(() => expect(repositoryMocks.saveDiscoursePublishSettingsToRuntime).toHaveBeenLastCalledWith({
    site_url: 'https://talk.example.com'
  }));
});

it('does not replace newer input when an earlier save finishes', async () => {
  repositoryMocks.loadDiscoursePublishSettingsFromRuntime.mockResolvedValue({
    has_api_key: false, site_url: 'https://forum.example.com', updated_at: null
  });
  let resolveSave: ((settings: typeof SAVED_SETTINGS) => void) | undefined;
  repositoryMocks.saveDiscoursePublishSettingsToRuntime.mockImplementationOnce(() => new Promise<typeof SAVED_SETTINGS>((resolve) => {
    resolveSave = resolve;
  }));
  renderWithLocalization(<SettingsPublishingSection />);
  const forumUrl = await screen.findByLabelText('Discourse forum URL');

  fireEvent.change(forumUrl, { target: { value: 'https://first.example.com' } });
  fireEvent.blur(forumUrl);
  fireEvent.change(forumUrl, { target: { value: 'https://newer.example.com' } });
  await act(async () => resolveSave?.({ ...SAVED_SETTINGS, site_url: 'https://first.example.com' }));

  expect(forumUrl).toHaveValue('https://newer.example.com');
});
