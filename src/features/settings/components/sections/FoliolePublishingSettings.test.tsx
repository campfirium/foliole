import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../../../../shared/localization/testLocalization';
import { AppConfirmationProvider } from '../../../../shared/ui';

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

function renderSettings() {
  return renderWithLocalization(
    <AppConfirmationProvider>
      <FoliolePublishingSettings expanded onExpandedChange={vi.fn()} />
    </AppConfirmationProvider>
  );
}

it('keeps every required Cloudflare value in one setup flow and deploys only on request', async () => {
  renderSettings();
  const deploy = await screen.findByRole('button', { name: 'Deploy' });
  expect(screen.getByLabelText('Cloudflare API Token')).toBeVisible();
  expect(screen.getByLabelText('Cloudflare Account ID')).toBeVisible();
  expect(screen.getByLabelText('pages.dev subdomain')).toBeVisible();
  expect(screen.getByText('Custom domain (optional)')).toBeVisible();
  expect(screen.getByText('Security notice: Foliole does not operate or authorize foliole.pages.dev.')).toBeVisible();
  expect(deploy).toBeDisabled();

  fireEvent.change(screen.getByLabelText('Cloudflare API Token'), { target: { value: 'SENTINEL-TOKEN' } });
  fireEvent.change(screen.getByLabelText('Cloudflare Account ID'), { target: { value: 'account' } });
  fireEvent.change(screen.getByLabelText('pages.dev subdomain'), { target: { value: 'my-site' } });
  expect(deploy).toBeEnabled();
  expect(mocks.connectFoliolePublishSettingsToRuntime).not.toHaveBeenCalled();
});

it('opens the Cloudflare page with Pages Edit permission preselected', async () => {
  renderSettings();
  fireEvent.click(await screen.findByRole('button', { name: 'API Token request page ↗' }));
  expect(openExternalUrl).toHaveBeenCalledWith(
    'https://dash.cloudflare.com/profile/api-tokens?permissionGroupKeys=%5B%7B%22key%22%3A%22page%22%2C%22type%22%3A%22edit%22%7D%5D&accountId=%2A&zoneId=all&name=Foliole%20Publish'
  );
});

it('reports an unavailable subdomain without exposing Cloudflare project reuse', async () => {
  mocks.connectFoliolePublishSettingsToRuntime
    .mockResolvedValueOnce({ project_name: 'my-site', status: 'subdomain_not_detected' })
    .mockResolvedValueOnce({ project_name: 'my-site', status: 'subdomain_unavailable' });
  renderSettings();
  fireEvent.change(await screen.findByLabelText('Cloudflare API Token'), { target: { value: 'SENTINEL-TOKEN' } });
  fireEvent.change(await screen.findByLabelText('Cloudflare Account ID'), { target: { value: 'account' } });
  fireEvent.change(screen.getByLabelText('pages.dev subdomain'), { target: { value: 'my-site' } });
  fireEvent.click(screen.getByRole('button', { name: 'Deploy' }));
  expect(await screen.findByText('No use of this subdomain was detected')).toBeVisible();
  expect(mocks.connectFoliolePublishSettingsToRuntime).toHaveBeenLastCalledWith({
    account_id: 'account', api_token: 'SENTINEL-TOKEN', confirm_subdomain_risk: false, project_name: 'my-site',
    site_address: ''
  });
  fireEvent.click(screen.getByRole('button', { name: 'Continue deployment' }));
  expect(await screen.findByText('This subdomain is already in use. Choose another one.')).toBeVisible();
  expect(screen.queryByText(/Cloudflare project/i)).not.toBeInTheDocument();
  expect(mocks.connectFoliolePublishSettingsToRuntime).toHaveBeenLastCalledWith(expect.objectContaining({
    confirm_subdomain_risk: true
  }));
});

it('shows the exact Cloudflare-assigned address in the locked deployment step', async () => {
  const assigned = { ...CONNECTED, pages_url: 'https://foliole-ehn.pages.dev', site_address: 'https://foliole-ehn.pages.dev' };
  mocks.connectFoliolePublishSettingsToRuntime
    .mockResolvedValueOnce({ project_name: 'foliole', status: 'subdomain_detected' })
    .mockResolvedValueOnce({ settings: assigned, status: 'connected' });
  renderSettings();
  fireEvent.change(await screen.findByLabelText('Cloudflare API Token'), { target: { value: 'SENTINEL-TOKEN' } });
  fireEvent.change(screen.getByLabelText('Cloudflare Account ID'), { target: { value: 'account' } });
  fireEvent.change(screen.getByLabelText('pages.dev subdomain'), { target: { value: 'foliole' } });
  fireEvent.click(screen.getByRole('button', { name: 'Deploy' }));
  expect(await screen.findByText('This subdomain appears to be in use')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Continue deployment' }));
  expect(await screen.findByText('https://foliole-ehn.pages.dev')).toBeVisible();
  expect(screen.queryByLabelText('pages.dev subdomain')).not.toBeInTheDocument();
});

it('updates a manually configured custom domain through the dedicated command', async () => {
  mocks.loadFoliolePublishSettingsFromRuntime.mockResolvedValue(CONNECTED);
  mocks.updateFoliolePublishSiteAddressInRuntime.mockResolvedValue({
    ...CONNECTED, site_address: 'https://notes.example.com'
  });
  renderSettings();
  expect(await screen.findByText('https://my-site.pages.dev')).toBeVisible();
  fireEvent.change(screen.getByLabelText('Foliole Publish custom domain'), {
    target: { value: 'https://notes.example.com' }
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(mocks.updateFoliolePublishSiteAddressInRuntime).toHaveBeenCalledWith('https://notes.example.com'));
  expect(screen.getByLabelText('Foliole Publish custom domain')).toHaveValue('https://notes.example.com');
});

it('restores the saved address when a custom-domain update fails', async () => {
  mocks.loadFoliolePublishSettingsFromRuntime.mockResolvedValue(CONNECTED);
  mocks.updateFoliolePublishSiteAddressInRuntime.mockRejectedValue(new Error('Update failed.'));
  renderSettings();
  expect(await screen.findByText('https://my-site.pages.dev')).toBeVisible();
  const domain = screen.getByLabelText('Foliole Publish custom domain');
  fireEvent.change(domain, { target: { value: 'https://notes.example.com' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(await screen.findByText('Update failed.')).toBeVisible();
  expect(domain).toHaveValue('');
  expect(screen.getByText('https://my-site.pages.dev')).toBeVisible();
});

it('can restore pages.dev and opens the Cloudflare custom-domain guide', async () => {
  const custom = { ...CONNECTED, site_address: 'https://notes.example.com' };
  mocks.loadFoliolePublishSettingsFromRuntime.mockResolvedValue(custom);
  mocks.updateFoliolePublishSiteAddressInRuntime.mockResolvedValue(CONNECTED);
  renderSettings();
  expect(await screen.findByText('https://my-site.pages.dev')).toBeVisible();
  const domain = screen.getByLabelText('Foliole Publish custom domain');
  fireEvent.change(domain, { target: { value: '' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(mocks.updateFoliolePublishSiteAddressInRuntime).toHaveBeenCalledWith(''));
  fireEvent.click(screen.getByRole('button', { name: 'Bind a domain in Cloudflare ↗' }));
  expect(openExternalUrl).toHaveBeenCalledWith('https://developers.cloudflare.com/pages/configuration/custom-domains/');
});

it('confirms destructive disconnect before deleting the managed Cloudflare site', async () => {
  mocks.loadFoliolePublishSettingsFromRuntime.mockResolvedValue(CONNECTED);
  renderSettings();
  fireEvent.click(await screen.findByRole('button', { name: 'Disconnect and delete site' }));
  expect(await screen.findByText('Disconnect and delete this site?')).toBeVisible();
  expect(mocks.disconnectFoliolePublishSettingsFromRuntime).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Disconnect and delete' }));
  await waitFor(() => expect(mocks.disconnectFoliolePublishSettingsFromRuntime).toHaveBeenCalledOnce());
  expect(await screen.findByRole('button', { name: 'Deploy' })).toBeVisible();
});
