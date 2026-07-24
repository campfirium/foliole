import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../../../../shared/localization/testLocalization';
import { subscribeOpenFoliolePublishedTopics } from '../../../../shared/platform/runtime/foliolePublishedNavigation';
import { AppConfirmationProvider } from '../../../../shared/ui';

import { FoliolePublishingSettings } from './FoliolePublishingSettings';

const mocks = vi.hoisted(() => ({
  connectFoliolePublishSettingsToRuntime: vi.fn(),
  disconnectFoliolePublishSettingsFromRuntime: vi.fn(),
  loadFoliolePublishThemeFromRuntime: vi.fn(),
  loadFoliolePublishSettingsFromRuntime: vi.fn(),
  loadFoliolePublishSiteTitleFromRuntime: vi.fn(),
  openFoliolePublishCustomThemeFromRuntime: vi.fn(),
  publishFoliolePublishThemeChangesFromRuntime: vi.fn(),
  saveFoliolePublishDraftToRuntime: vi.fn(),
  saveFoliolePublishSiteTitleToRuntime: vi.fn(),
  updateFoliolePublishLocalPagesFromRuntime: vi.fn(),
  viewFoliolePublishSiteFromRuntime: vi.fn(),
  updateFoliolePublishSiteAddressInRuntime: vi.fn(),
  useFoliolePublishThemeFromRuntime: vi.fn()
}));
const openExternalUrl = vi.hoisted(() => vi.fn());
const probeUrlWithLinkPanel = vi.hoisted(() => vi.fn());
vi.mock('../../../../shared/platform/foliolePublishRepository', () => mocks);
vi.mock('../../../../shared/platform/runtimeExternalNavigation', () => ({ openExternalUrl }));
vi.mock('../../../../shared/platform/external/linkPanelUrlProbe', () => ({ probeUrlWithLinkPanel }));

const EMPTY = { account_id: '', credentials_valid: false, field_catalog: [], has_credentials: false, pages_url: '', project_name: '', site_address: '', updated_at: null };
const VALID_ACCOUNT_ID = '023e105f4ecef8ad9ca31a8372d0c353';
const VALID_API_TOKEN = 'Sn3lZJTBX6kkg7OdcBUAxOO963GEIyGQqnFTOFYY';
const CONNECTED = {
  account_id: 'account', credentials_valid: true, field_catalog: [], has_credentials: true, pages_url: 'https://my-site.pages.dev',
  project_name: 'my-site', site_address: 'https://my-site.pages.dev', updated_at: '2026-07-19T00:00:00.000Z'
};

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset());
  openExternalUrl.mockReset();
  probeUrlWithLinkPanel.mockReset().mockResolvedValue(false);
  mocks.loadFoliolePublishSettingsFromRuntime.mockResolvedValue(EMPTY);
  mocks.loadFoliolePublishSiteTitleFromRuntime.mockResolvedValue({ site_title: 'Foliole' });
  mocks.loadFoliolePublishThemeFromRuntime.mockResolvedValue({
    active_theme: 'foliole', custom_theme: null, official_theme_version: 4
  });
  mocks.saveFoliolePublishSiteTitleToRuntime.mockImplementation(async (siteTitle: string) => ({ site_title: siteTitle.trim() }));
  mocks.saveFoliolePublishDraftToRuntime.mockImplementation(async (input: {
    account_id: string; api_token: string; project_name: string;
  }) => ({
    ...EMPTY,
    account_id: input.account_id,
    credentials_valid: Boolean(input.api_token),
    has_credentials: Boolean(input.api_token),
    project_name: input.project_name
  }));
  mocks.viewFoliolePublishSiteFromRuntime.mockResolvedValue({ local_path: '/Publish/Site/index.html', url: null });
  mocks.openFoliolePublishCustomThemeFromRuntime.mockResolvedValue({
    local_path: '/Publish/Theme',
    theme: { active_theme: 'custom', custom_theme: { based_on_official_version: 4 }, official_theme_version: 4 }
  });
  mocks.useFoliolePublishThemeFromRuntime.mockResolvedValue({
    theme: { active_theme: 'foliole', custom_theme: { based_on_official_version: 4 }, official_theme_version: 4 }
  });
  mocks.updateFoliolePublishLocalPagesFromRuntime.mockResolvedValue({ local_path: '/Publish/Site/index.html' });
  mocks.publishFoliolePublishThemeChangesFromRuntime.mockResolvedValue({ local_path: '/Publish/Site/index.html' });
  mocks.disconnectFoliolePublishSettingsFromRuntime.mockResolvedValue(EMPTY);
});

function renderSettings() {
  return renderWithLocalization(
    <AppConfirmationProvider>
      <FoliolePublishingSettings expanded onExpandedChange={vi.fn()} />
    </AppConfirmationProvider>
  );
}

it('presents local and Web views of the generated static pages', async () => {
  mocks.loadFoliolePublishSettingsFromRuntime.mockResolvedValue(CONNECTED);
  renderSettings();
  expect(await screen.findByRole('heading', { level: 4, name: 'Static pages' })).toBeVisible();
  expect(screen.getByRole('heading', { level: 4, name: 'Hosting' })).toBeVisible();
  expect(screen.getByRole('heading', { level: 5, name: 'Theme' })).toBeVisible();
  expect(screen.getByRole('heading', { level: 5, name: 'Cloudflare Pages' })).toBeVisible();
  expect(screen.getByText('Generated each time you run “Publish to the site” on material.')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'View local' }));
  await waitFor(() => expect(mocks.viewFoliolePublishSiteFromRuntime).toHaveBeenCalledOnce());
  fireEvent.click(screen.getByRole('button', { name: 'View Web' }));
  await waitFor(() => expect(openExternalUrl).toHaveBeenCalledWith('https://my-site.pages.dev'));
});

it('opens Published from the first static-pages management action', async () => {
  const listener = vi.fn();
  const unsubscribe = subscribeOpenFoliolePublishedTopics(listener);
  renderSettings();

  fireEvent.click(await screen.findByRole('button', { name: 'Manage content' }));

  expect(listener).toHaveBeenCalledOnce();
  unsubscribe();
});

it('keeps Web actions disabled before hosting is connected', async () => {
  renderSettings();
  expect(await screen.findByRole('button', { name: 'View Web' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Update Web' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'View local' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Update local' })).toBeEnabled();
});

it('shows a user-facing error when local pages cannot be updated', async () => {
  mocks.updateFoliolePublishLocalPagesFromRuntime.mockRejectedValueOnce(
    new Error('Theme file page.html has a Liquid error at line 4, column 8: unexpected tag. Edit page.html, then try again.')
  );
  renderSettings();
  fireEvent.click(await screen.findByRole('button', { name: 'Update local' }));
  expect(await screen.findByText(/Theme file page\.html has a Liquid error at line 4, column 8/u)).toBeVisible();
});

it('keeps every required Cloudflare value in one setup flow and deploys only on request', async () => {
  renderSettings();
  const deploy = await screen.findByRole('button', { name: 'Deploy' });
  expect(screen.getByText('Cloudflare connection')).toBeVisible();
  expect(screen.getByText('Not connected')).toBeVisible();
  expect(screen.getByLabelText('Cloudflare API Token')).toBeVisible();
  expect(screen.getByLabelText('Cloudflare Account ID')).toBeVisible();
  expect(screen.getByLabelText('pages.dev subdomain')).toBeVisible();
  expect(screen.getByText('Custom domain (optional)')).toBeVisible();
  expect(deploy).toBeDisabled();

  fireEvent.change(screen.getByLabelText('Cloudflare API Token'), { target: { value: '/' } });
  fireEvent.change(screen.getByLabelText('Cloudflare Account ID'), { target: { value: '/' } });
  fireEvent.change(screen.getByLabelText('pages.dev subdomain'), { target: { value: 'my-site' } });
  expect(screen.getByText(/Enter the complete token from Cloudflare/u)).toBeVisible();
  expect(screen.getByText(/Enter a 32-character Account ID/u)).toBeVisible();
  expect(deploy).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Cloudflare API Token'), { target: { value: VALID_API_TOKEN } });
  fireEvent.change(screen.getByLabelText('Cloudflare Account ID'), { target: { value: VALID_ACCOUNT_ID } });
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
  mocks.connectFoliolePublishSettingsToRuntime.mockResolvedValueOnce({ project_name: 'my-site', status: 'subdomain_unavailable' });
  renderSettings();
  fireEvent.change(await screen.findByLabelText('Cloudflare API Token'), { target: { value: VALID_API_TOKEN } });
  fireEvent.change(await screen.findByLabelText('Cloudflare Account ID'), { target: { value: VALID_ACCOUNT_ID } });
  fireEvent.change(screen.getByLabelText('pages.dev subdomain'), { target: { value: 'my-site' } });
  fireEvent.click(screen.getByRole('button', { name: 'Deploy' }));
  expect(await screen.findByText('This subdomain doesn’t appear to be in use')).toBeVisible();
  expect(probeUrlWithLinkPanel).toHaveBeenCalledWith('https://my-site.pages.dev');
  expect(mocks.connectFoliolePublishSettingsToRuntime).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Continue deployment' }));
  expect(await screen.findByText('This subdomain is already in use. Choose another one.')).toBeVisible();
  expect(screen.queryByText(/Cloudflare project/i)).not.toBeInTheDocument();
  expect(mocks.connectFoliolePublishSettingsToRuntime).toHaveBeenLastCalledWith(expect.objectContaining({
    confirm_subdomain_risk: true
  }));
});

it('shows the exact Cloudflare-assigned address in the locked deployment step', async () => {
  const assigned = { ...CONNECTED, pages_url: 'https://foliole-ehn.pages.dev', site_address: 'https://foliole-ehn.pages.dev' };
  probeUrlWithLinkPanel.mockResolvedValueOnce(true);
  mocks.connectFoliolePublishSettingsToRuntime.mockResolvedValueOnce({ settings: assigned, status: 'connected' });
  renderSettings();
  fireEvent.change(await screen.findByLabelText('Cloudflare API Token'), { target: { value: VALID_API_TOKEN } });
  fireEvent.change(screen.getByLabelText('Cloudflare Account ID'), { target: { value: VALID_ACCOUNT_ID } });
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
  expect(await screen.findByText('Connected')).toBeVisible();
  fireEvent.click(await screen.findByRole('button', { name: 'Disconnect and delete site' }));
  expect(await screen.findByText('Disconnect and delete this site?')).toBeVisible();
  expect(mocks.disconnectFoliolePublishSettingsFromRuntime).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Disconnect and delete' }));
  await waitFor(() => expect(mocks.disconnectFoliolePublishSettingsFromRuntime).toHaveBeenCalledOnce());
  expect(await screen.findByRole('button', { name: 'Deploy' })).toBeVisible();
});
