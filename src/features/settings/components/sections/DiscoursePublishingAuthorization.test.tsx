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
    categories: [], fetched_at: null, from_cache: false, recent_category_ids: [], recent_tags: [], tags: []
  });
});

function renderSettings() {
  return renderWithLocalization(<DiscoursePublishingSettings expanded onExpandedChange={vi.fn()} />);
}

it('explains the forum requirement and opens the generated authorization link', async () => {
  renderSettings();
  expect(await screen.findByText('The forum must allow your account to generate User API Keys.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Generate authorization link' }));
  await waitFor(() => expect(repositoryMocks.beginDiscourseUserApiAuthorizationFromRuntime)
    .toHaveBeenCalledWith('https://forum.example.com'));
  expect(openExternalUrl).toHaveBeenCalledWith(expect.stringContaining('/user-api-key/new'));
  expect(await screen.findByText('Authorization page opened.')).toBeInTheDocument();
});

it('saves and validates the encrypted authorization result without exposing the key', async () => {
  renderSettings();
  const input = await screen.findByLabelText('Discourse authorization result');
  fireEvent.change(input, { target: { value: 'ENCRYPTED-AUTHORIZATION-RESULT' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save authorization' }));
  await waitFor(() => expect(repositoryMocks.completeDiscourseUserApiAuthorizationFromRuntime).toHaveBeenCalledWith(
    'https://forum.example.com',
    'ENCRYPTED-AUTHORIZATION-RESULT'
  ));
  expect(repositoryMocks.loadDiscoursePublishCatalogFromRuntime).toHaveBeenCalledWith({ refresh: true });
  expect(input).toHaveValue('');
  expect(await screen.findByText('Connection successful.')).toBeInTheDocument();
});

it('points users to the forum permission when authorization fails', async () => {
  repositoryMocks.completeDiscourseUserApiAuthorizationFromRuntime.mockRejectedValue(new Error('private detail'));
  renderSettings();
  fireEvent.change(await screen.findByLabelText('Discourse authorization result'), { target: { value: 'bad-result' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save authorization' }));
  expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't authorize Foliole with Discourse.");
  expect(screen.getByRole('alert')).toHaveTextContent('forum allows your account to generate User API Keys');
  expect(screen.getByRole('alert')).not.toHaveTextContent('private detail');
});
