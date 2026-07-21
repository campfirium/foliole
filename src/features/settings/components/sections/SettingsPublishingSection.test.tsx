import { act, fireEvent, screen, waitFor } from '@testing-library/react';
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
    account_id: '', has_credentials: false, pages_url: '', project_name: '', site_address: '', updated_at: null
  });
  folioleRepositoryMocks.viewFoliolePublishSiteFromRuntime.mockResolvedValue({ local_path: '/Publish/Site/index.html', url: null });
  folioleRepositoryMocks.connectFoliolePublishSettingsToRuntime.mockResolvedValue({
    settings: {
      account_id: 'account', has_credentials: true, pages_url: 'https://my-notes.pages.dev',
      project_name: 'my-notes', site_address: 'https://my-notes.pages.dev', updated_at: '2026-07-16T00:00:00.000Z'
    },
    status: 'connected'
  });
});

it('starts collapsed and restores independent disclosure state after remounting', () => {
  const first = renderWithLocalization(<SettingsPublishingSection />);
  const foliole = screen.getByRole('button', { name: 'Publish to the web' });
  const wordpress = screen.getByRole('button', { name: 'WordPress' });
  const discourse = screen.getByRole('button', { name: 'Discourse' });
  expect([foliole, wordpress, discourse].map((button) => button.getAttribute('aria-expanded'))).toEqual(['false', 'false', 'false']);

  fireEvent.click(wordpress);
  expect(wordpress).toHaveAttribute('aria-expanded', 'true');
  expect(foliole).toHaveAttribute('aria-expanded', 'false');
  expect(discourse).toHaveAttribute('aria-expanded', 'false');

  first.unmount();
  renderWithLocalization(<SettingsPublishingSection />);
  expect(screen.getByRole('button', { name: 'WordPress' })).toHaveAttribute('aria-expanded', 'true');
});

it('opens the local static pages from the visible Publish settings row', async () => {
  renderWithLocalization(<SettingsPublishingSection />);
  fireEvent.click(screen.getByRole('button', { name: 'Publish to the web' }));
  fireEvent.click(await screen.findByRole('button', { name: 'View' }));

  await waitFor(() => expect(folioleRepositoryMocks.viewFoliolePublishSiteFromRuntime).toHaveBeenCalledOnce());
});

it('uses concise Publish copy and the standard settings input width', async () => {
  renderWithLocalization(<SettingsPublishingSection />);
  fireEvent.click(screen.getByRole('button', { name: 'Discourse' }));

  const forumUrl = await screen.findByLabelText('Discourse forum URL');
  const headings = screen.getAllByRole('heading', { level: 3 });
  expect(headings).toHaveLength(3);
  expect(screen.getByRole('heading', { level: 3, name: 'Publish to the web' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { level: 3, name: 'WordPress' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { level: 3, name: 'Discourse' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Discourse forum' })).toBeNull();
  expect(screen.getByText('Forum URL')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Test access' })).toBeEnabled();
  expect(forumUrl.parentElement).toHaveClass('w-[min(360px,100%)]');
});

it('connects WordPress with an Application Password and shows the WordPress.com scope warning', async () => {
  renderWithLocalization(<SettingsPublishingSection />);
  fireEvent.click(screen.getByRole('button', { name: 'WordPress' }));
  fireEvent.change(await screen.findByLabelText('WordPress site address'), {
    target: { value: 'https://free-site.wordpress.com' }
  });
  fireEvent.change(screen.getByLabelText('WordPress username'), { target: { value: 'writer' } });
  fireEvent.change(screen.getByLabelText('WordPress Application Password'), {
    target: { value: 'SENTINEL-WORDPRESS-APP-PASSWORD' }
  });

  expect(screen.getByText(/account-level device credential/u)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Connect' }));

  await waitFor(() => expect(wordpressRepositoryMocks.connectWordPressPublishSettingsToRuntime).toHaveBeenCalledWith({
    application_password: 'SENTINEL-WORDPRESS-APP-PASSWORD',
    site_url: 'https://free-site.wordpress.com',
    username: 'writer'
  }));
  expect(await screen.findByText('Connection successful.')).toBeInTheDocument();
  expect(screen.getByLabelText('WordPress Application Password')).toHaveValue('');
});

it('disconnects Discourse and removes the saved credential state', async () => {
  renderWithLocalization(<SettingsPublishingSection />);
  fireEvent.click(screen.getByRole('button', { name: 'Discourse' }));
  const disconnect = await screen.findByRole('button', { name: 'Remove authorization' });
  fireEvent.click(disconnect);

  await waitFor(() => expect(repositoryMocks.disconnectDiscoursePublishSettingsFromRuntime).toHaveBeenCalledOnce());
  expect(screen.queryByRole('button', { name: 'Remove authorization' })).toBeNull();
});

it('saves the forum URL silently after blur or Enter', async () => {
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

it('saves current settings and refreshes the Discourse catalog when testing the connection', async () => {
  renderWithLocalization(<SettingsPublishingSection />);
  fireEvent.click(screen.getByRole('button', { name: 'Discourse' }));
  const testConnection = await screen.findByRole('button', { name: 'Test access' });
  await waitFor(() => expect(testConnection).toBeEnabled());

  fireEvent.click(testConnection);

  await waitFor(() => expect(repositoryMocks.loadDiscoursePublishCatalogFromRuntime).toHaveBeenCalledWith({ refresh: true }));
  expect(repositoryMocks.saveDiscoursePublishSettingsToRuntime).toHaveBeenCalledWith({
    site_url: 'https://forum.example.com'
  });
  expect(await screen.findByText('Publishing access verified.')).toBeInTheDocument();
});

it('shows a user-facing error when the connection test fails', async () => {
  repositoryMocks.loadDiscoursePublishCatalogFromRuntime.mockRejectedValue(new Error('private runtime detail'));
  renderWithLocalization(<SettingsPublishingSection />);
  fireEvent.click(screen.getByRole('button', { name: 'Discourse' }));
  const testConnection = await screen.findByRole('button', { name: 'Test access' });
  await waitFor(() => expect(testConnection).toBeEnabled());

  fireEvent.click(testConnection);

  expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't connect to Discourse.");
  expect(screen.getByRole('alert')).not.toHaveTextContent('private runtime detail');
});

it('does not report a cached catalog as a successful connection test', async () => {
  repositoryMocks.loadDiscoursePublishCatalogFromRuntime.mockResolvedValue({
    categories: [], fetched_at: '2026-07-02T00:00:00.000Z', from_cache: true,
    recent_category_ids: [], recent_tags: [], tags: []
  });
  renderWithLocalization(<SettingsPublishingSection />);
  fireEvent.click(screen.getByRole('button', { name: 'Discourse' }));
  const testConnection = await screen.findByRole('button', { name: 'Test access' });
  await waitFor(() => expect(testConnection).toBeEnabled());

  fireEvent.click(testConnection);

  expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't connect to Discourse.");
  expect(screen.queryByText('Publishing access verified.')).toBeNull();
});
