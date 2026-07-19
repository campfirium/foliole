import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../../../../shared/localization/testLocalization';

import { FoliolePublishingSettings } from './FoliolePublishingSettings';

const mocks = vi.hoisted(() => ({
  connectFoliolePublishSettingsToRuntime: vi.fn(),
  disconnectFoliolePublishSettingsFromRuntime: vi.fn(),
  loadFoliolePublishSettingsFromRuntime: vi.fn(),
  previewFoliolePublishFromRuntime: vi.fn(),
  updateFoliolePublishSiteAddressInRuntime: vi.fn()
}));
const openExternalUrl = vi.hoisted(() => vi.fn());
vi.mock('../../../../shared/platform/foliolePublishRepository', () => mocks);
vi.mock('../../../../shared/platform/runtimeExternalNavigation', () => ({ openExternalUrl }));

const EMPTY = { account_id: '', has_credentials: false, pages_url: '', project_name: '', site_address: '', updated_at: null };
const CONNECTED = {
  account_id: 'account', has_credentials: true, pages_url: 'https://my-site.pages.dev',
  project_name: 'my-site', site_address: 'https://my-site.pages.dev', updated_at: '2026-07-19T00:00:00.000Z'
};

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset());
  openExternalUrl.mockReset();
  mocks.loadFoliolePublishSettingsFromRuntime.mockResolvedValue(EMPTY);
  mocks.previewFoliolePublishFromRuntime.mockResolvedValue({ local_path: '/Publish/Site/index.html', url: null });
  mocks.disconnectFoliolePublishSettingsFromRuntime.mockResolvedValue(EMPTY);
});

it('keeps credentials local while moving between the two setup steps', async () => {
  renderWithLocalization(<FoliolePublishingSettings expanded onExpandedChange={vi.fn()} />);
  fireEvent.change(await screen.findByLabelText('Cloudflare Account ID'), { target: { value: 'account' } });
  fireEvent.change(screen.getByLabelText('Cloudflare authorization result'), { target: { value: 'SENTINEL-TOKEN' } });
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  expect(mocks.connectFoliolePublishSettingsToRuntime).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Free pages.dev site name')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Back' }));
  expect(screen.getByLabelText('Cloudflare authorization result')).toHaveValue('SENTINEL-TOKEN');
});

it('opens the Cloudflare page with Pages Edit permission preselected', async () => {
  renderWithLocalization(<FoliolePublishingSettings expanded onExpandedChange={vi.fn()} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Create access in Cloudflare' }));
  expect(openExternalUrl).toHaveBeenCalledWith(
    'https://dash.cloudflare.com/profile/api-tokens?permissionGroupKeys=%5B%7B%22key%22%3A%22page%22%2C%22type%22%3A%22edit%22%7D%5D&accountId=%2A&zoneId=all&name=Foliole%20Publish'
  );
});

it('requires explicit confirmation before using an existing Pages project', async () => {
  mocks.connectFoliolePublishSettingsToRuntime
    .mockResolvedValueOnce({ project_name: 'my-site', status: 'project_exists' })
    .mockResolvedValueOnce({ settings: CONNECTED, status: 'connected' });
  renderWithLocalization(<FoliolePublishingSettings expanded onExpandedChange={vi.fn()} />);
  fireEvent.change(await screen.findByLabelText('Cloudflare Account ID'), { target: { value: 'account' } });
  fireEvent.change(screen.getByLabelText('Cloudflare authorization result'), { target: { value: 'SENTINEL-TOKEN' } });
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  fireEvent.change(screen.getByLabelText('Free pages.dev site name'), { target: { value: 'my-site' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create and publish' }));
  expect(await screen.findByText('That site address already exists.')).toBeVisible();
  expect(mocks.connectFoliolePublishSettingsToRuntime).toHaveBeenLastCalledWith({
    account_id: 'account', api_token: 'SENTINEL-TOKEN', project_name: 'my-site',
    site_address: '', use_existing_project: false
  });
  fireEvent.click(screen.getByRole('button', { name: 'Use existing project' }));
  await waitFor(() => expect(mocks.connectFoliolePublishSettingsToRuntime).toHaveBeenLastCalledWith(expect.objectContaining({
    use_existing_project: true
  })));
  expect(await screen.findByText('Ready to publish.')).toBeVisible();
  expect(screen.queryByLabelText('Cloudflare authorization result')).not.toBeInTheDocument();
});

it('updates a manually configured custom domain through the dedicated command', async () => {
  mocks.loadFoliolePublishSettingsFromRuntime.mockResolvedValue(CONNECTED);
  mocks.updateFoliolePublishSiteAddressInRuntime.mockResolvedValue({
    ...CONNECTED, site_address: 'https://notes.example.com'
  });
  renderWithLocalization(<FoliolePublishingSettings expanded onExpandedChange={vi.fn()} />);
  fireEvent.change(await screen.findByLabelText('Foliole Publish custom domain'), {
    target: { value: 'https://notes.example.com' }
  });
  fireEvent.click(screen.getByRole('button', { name: 'Use this address' }));
  await waitFor(() => expect(mocks.updateFoliolePublishSiteAddressInRuntime).toHaveBeenCalledWith('https://notes.example.com'));
  expect(screen.getByLabelText('Foliole Publish custom domain')).toHaveValue('https://notes.example.com');
});

it('restores the saved address when a custom-domain update fails', async () => {
  mocks.loadFoliolePublishSettingsFromRuntime.mockResolvedValue(CONNECTED);
  mocks.updateFoliolePublishSiteAddressInRuntime.mockRejectedValue(new Error('Update failed.'));
  renderWithLocalization(<FoliolePublishingSettings expanded onExpandedChange={vi.fn()} />);
  const domain = await screen.findByLabelText('Foliole Publish custom domain');
  fireEvent.change(domain, { target: { value: 'https://notes.example.com' } });
  fireEvent.click(screen.getByRole('button', { name: 'Use this address' }));
  expect(await screen.findByText('Update failed.')).toBeVisible();
  expect(domain).toHaveValue('');
  expect(screen.getByText('https://my-site.pages.dev')).toBeVisible();
});

it('can restore pages.dev and opens the Cloudflare custom-domain guide', async () => {
  const custom = { ...CONNECTED, site_address: 'https://notes.example.com' };
  mocks.loadFoliolePublishSettingsFromRuntime.mockResolvedValue(custom);
  mocks.updateFoliolePublishSiteAddressInRuntime.mockResolvedValue(CONNECTED);
  renderWithLocalization(<FoliolePublishingSettings expanded onExpandedChange={vi.fn()} />);
  const domain = await screen.findByLabelText('Foliole Publish custom domain');
  fireEvent.change(domain, { target: { value: '' } });
  fireEvent.click(screen.getByRole('button', { name: 'Use pages.dev' }));
  await waitFor(() => expect(mocks.updateFoliolePublishSiteAddressInRuntime).toHaveBeenCalledWith(''));
  fireEvent.click(screen.getByRole('button', { name: 'Open setup guide' }));
  expect(openExternalUrl).toHaveBeenCalledWith('https://developers.cloudflare.com/pages/configuration/custom-domains/');
});
