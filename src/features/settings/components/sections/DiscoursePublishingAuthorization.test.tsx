import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../../../../shared/localization/testLocalization';

import { DiscoursePublishingSettings } from './DiscoursePublishingSettings';

const repositoryMocks = vi.hoisted(() => ({
  beginDiscourseUserApiAuthorizationFromRuntime: vi.fn(),
  completeDiscourseUserApiAuthorizationFromRuntime: vi.fn(),
  disconnectDiscoursePublishSettingsFromRuntime: vi.fn(),
  loadDiscoursePublishCatalogFromRuntime: vi.fn(),
  loadDiscoursePublishSettingsFromRuntime: vi.fn(),
  saveDiscoursePublishSettingsToRuntime: vi.fn()
}));
const openExternalUrl = vi.hoisted(() => vi.fn());

vi.mock('../../../../shared/platform/discoursePublishRepository', () => repositoryMocks);
vi.mock('../../../../shared/platform/runtimeExternalNavigation', () => ({ openExternalUrl }));

beforeEach(() => {
  Object.values(repositoryMocks).forEach((mock) => mock.mockReset());
  openExternalUrl.mockReset();
  repositoryMocks.loadDiscoursePublishSettingsFromRuntime.mockResolvedValue({
    has_api_key: false, site_url: 'https://forum.example.com', updated_at: null
  });
  repositoryMocks.saveDiscoursePublishSettingsToRuntime.mockResolvedValue({
    has_api_key: false, site_url: 'https://forum.example.com', updated_at: null
  });
  repositoryMocks.beginDiscourseUserApiAuthorizationFromRuntime.mockResolvedValue({
    authorization_url: 'https://forum.example.com/user-api-key/new?scopes=read%2Cwrite'
  });
  repositoryMocks.completeDiscourseUserApiAuthorizationFromRuntime.mockResolvedValue({
    has_api_key: true, site_url: 'https://forum.example.com', updated_at: '2026-07-19T00:00:00.000Z'
  });
  repositoryMocks.loadDiscoursePublishCatalogFromRuntime.mockResolvedValue({
    categories: [], fetched_at: null, from_cache: false, last_published_tags: [], recent_category_ids: [], recent_tags: [], tags: []
  });
});

function renderSettings() {
  return renderWithLocalization(<DiscoursePublishingSettings expanded onExpandedChange={vi.fn()} />);
}

it('opens the generated authorization page from the authorization step', async () => {
  renderSettings();
  expect(await screen.findByText('Enter forum address')).toBeInTheDocument();
  expect(screen.getByText('Get authorization')).toBeInTheDocument();
  expect(screen.getByText('Discourse connection')).toBeInTheDocument();
  expect(screen.getByText('Not connected')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Open the Discourse authorization page ↗' }));
  await waitFor(() => expect(repositoryMocks.beginDiscourseUserApiAuthorizationFromRuntime)
    .toHaveBeenCalledWith('https://forum.example.com'));
  expect(openExternalUrl).toHaveBeenCalledWith(expect.stringContaining('/user-api-key/new'));
});

it('connects only after the user selects Connect', async () => {
  renderSettings();
  const input = await screen.findByLabelText('Discourse authorization result');
  const connect = screen.getByRole('button', { name: 'Connect' });
  expect(connect).toBeDisabled();
  fireEvent.change(input, { target: { value: 'ENCRYPTED-AUTHORIZATION-RESULT' } });
  fireEvent.blur(input);
  expect(repositoryMocks.completeDiscourseUserApiAuthorizationFromRuntime).not.toHaveBeenCalled();
  expect(connect).toBeEnabled();
  fireEvent.click(connect);
  await waitFor(() => expect(repositoryMocks.completeDiscourseUserApiAuthorizationFromRuntime).toHaveBeenCalledWith(
    'https://forum.example.com',
    'ENCRYPTED-AUTHORIZATION-RESULT'
  ));
  expect(repositoryMocks.loadDiscoursePublishCatalogFromRuntime).toHaveBeenCalledWith({ refresh: true });
  expect(input).toHaveValue('');
  expect(await screen.findByText('Connected')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Disconnect' })).toBeVisible();
  expect(input).toBeDisabled();
});

it('points users to the forum permission when authorization fails', async () => {
  repositoryMocks.completeDiscourseUserApiAuthorizationFromRuntime.mockRejectedValue(new Error('private detail'));
  renderSettings();
  const input = await screen.findByLabelText('Discourse authorization result');
  fireEvent.change(input, { target: { value: 'bad-result' } });
  fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
  expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't complete Discourse authorization.");
  expect(screen.getByRole('alert')).toHaveTextContent('forum allows your account to generate User API Keys');
  expect(screen.getByRole('alert')).not.toHaveTextContent('private detail');
});
