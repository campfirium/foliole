import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../../../../shared/localization/testLocalization';
import { AppConfirmationProvider } from '../../../../shared/ui';

import { FoliolePublishingSettings } from './FoliolePublishingSettings';

const mocks = vi.hoisted(() => ({
  connectFoliolePublishSettingsToRuntime: vi.fn(),
  disconnectFoliolePublishSettingsFromRuntime: vi.fn(),
  loadFoliolePublishSettingsFromRuntime: vi.fn(),
  openFoliolePublishThemeFromRuntime: vi.fn(),
  publishFoliolePublishThemeChangesFromRuntime: vi.fn(),
  resetFoliolePublishThemeFromRuntime: vi.fn(),
  saveFoliolePublishDraftToRuntime: vi.fn(),
  updateFoliolePublishLocalPagesFromRuntime: vi.fn(),
  updateFoliolePublishSiteAddressInRuntime: vi.fn(),
  viewFoliolePublishSiteFromRuntime: vi.fn()
}));
const probeUrlWithLinkPanel = vi.hoisted(() => vi.fn());
vi.mock('../../../../shared/platform/foliolePublishRepository', () => mocks);
vi.mock('../../../../shared/platform/external/linkPanelUrlProbe', () => ({ probeUrlWithLinkPanel }));
vi.mock('../../../../shared/platform/runtimeExternalNavigation', () => ({ openExternalUrl: vi.fn() }));

const ACCOUNT_ID = '023e105f4ecef8ad9ca31a8372d0c353';
const TOKEN = 'Sn3lZJTBX6kkg7OdcBUAxOO963GEIyGQqnFTOFYY';
const EMPTY = {
  account_id: '', credentials_valid: false, field_catalog: [], has_credentials: false,
  pages_url: '', project_name: '', site_address: '', updated_at: null
};
const DRAFT = {
  ...EMPTY, account_id: ACCOUNT_ID, credentials_valid: true, has_credentials: true,
  project_name: 'my-site', updated_at: '2026-07-22T00:00:00.000Z'
};

function renderSettings() {
  return renderWithLocalization(
    <AppConfirmationProvider>
      <FoliolePublishingSettings expanded onExpandedChange={vi.fn()} />
    </AppConfirmationProvider>
  );
}

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset());
  probeUrlWithLinkPanel.mockReset().mockResolvedValue(false);
  mocks.loadFoliolePublishSettingsFromRuntime.mockResolvedValue(DRAFT);
  mocks.saveFoliolePublishDraftToRuntime.mockResolvedValue(DRAFT);
});

it('restores a usable draft while keeping the saved token masked and out of payloads', async () => {
  renderSettings();
  const token = await screen.findByLabelText('Cloudflare API Token');
  expect(token).toHaveValue('••••••••••••');
  expect(screen.getByLabelText('Cloudflare Account ID')).toHaveValue(ACCOUNT_ID);
  expect(screen.getByLabelText('pages.dev subdomain')).toHaveValue('my-site');
  expect(screen.getByRole('button', { name: 'Deploy' })).toBeEnabled();
  expect(screen.queryByRole('button', { name: 'Disconnect and delete site' })).not.toBeInTheDocument();

  fireEvent.focus(token);
  expect(token).toHaveValue('');
  fireEvent.blur(token);
  await waitFor(() => expect(mocks.saveFoliolePublishDraftToRuntime).toHaveBeenCalledWith({
    account_id: ACCOUNT_ID, api_token: '', project_name: 'my-site'
  }));
});

it('saves a replacement token before deployment and deploys with no display mask', async () => {
  renderSettings();
  const token = await screen.findByLabelText('Cloudflare API Token');
  fireEvent.focus(token);
  fireEvent.change(token, { target: { value: TOKEN } });
  fireEvent.change(screen.getByLabelText('pages.dev subdomain'), { target: { value: 'new-site' } });
  mocks.saveFoliolePublishDraftToRuntime.mockResolvedValueOnce({ ...DRAFT, project_name: 'new-site' });
  fireEvent.click(screen.getByRole('button', { name: 'Deploy' }));

  expect(await screen.findByText('This subdomain doesn’t appear to be in use')).toBeVisible();
  expect(mocks.saveFoliolePublishDraftToRuntime).toHaveBeenCalledWith({
    account_id: ACCOUNT_ID, api_token: TOKEN, project_name: 'new-site'
  });
  expect(mocks.connectFoliolePublishSettingsToRuntime).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Continue deployment' }));
  await waitFor(() => expect(mocks.connectFoliolePublishSettingsToRuntime).toHaveBeenCalledWith({
    account_id: ACCOUNT_ID, api_token: '', confirm_subdomain_risk: true,
    project_name: 'new-site', site_address: ''
  }));
});

it('does not continue deployment after draft persistence fails', async () => {
  mocks.loadFoliolePublishSettingsFromRuntime.mockResolvedValue(EMPTY);
  mocks.saveFoliolePublishDraftToRuntime.mockRejectedValue(new Error('Draft save failed.'));
  renderSettings();
  fireEvent.change(await screen.findByLabelText('Cloudflare API Token'), { target: { value: TOKEN } });
  fireEvent.change(screen.getByLabelText('Cloudflare Account ID'), { target: { value: ACCOUNT_ID } });
  fireEvent.change(screen.getByLabelText('pages.dev subdomain'), { target: { value: 'my-site' } });
  fireEvent.click(screen.getByRole('button', { name: 'Deploy' }));
  expect(await screen.findByText('Draft save failed.')).toBeVisible();
  expect(mocks.connectFoliolePublishSettingsToRuntime).not.toHaveBeenCalled();
});
