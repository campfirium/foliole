import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../../../../shared/localization/testLocalization';
import { AppConfirmationProvider } from '../../../../shared/ui';

import { FoliolePublishingSettings } from './FoliolePublishingSettings';

const runtime = vi.hoisted(() => ({
  connectFoliolePublishSettingsToRuntime: vi.fn(), disconnectFoliolePublishSettingsFromRuntime: vi.fn(),
  loadFoliolePublishSettingsFromRuntime: vi.fn(), loadFoliolePublishSiteTitleFromRuntime: vi.fn(), loadFoliolePublishThemeFromRuntime: vi.fn(),
  openFoliolePublishCustomThemeFromRuntime: vi.fn(), publishFoliolePublishThemeChangesFromRuntime: vi.fn(),
  saveFoliolePublishDraftToRuntime: vi.fn(),
  saveFoliolePublishSiteTitleToRuntime: vi.fn(), updateFoliolePublishLocalPagesFromRuntime: vi.fn(),
  updateFoliolePublishSiteAddressInRuntime: vi.fn(), useFoliolePublishThemeFromRuntime: vi.fn(), viewFoliolePublishSiteFromRuntime: vi.fn()
}));
const openExternalUrl = vi.hoisted(() => vi.fn());
vi.mock('../../../../shared/platform/foliolePublishRepository', () => runtime);
vi.mock('../../../../shared/platform/runtimeExternalNavigation', () => ({ openExternalUrl }));
vi.mock('../../../../shared/platform/external/linkPanelUrlProbe', () => ({ probeUrlWithLinkPanel: vi.fn() }));

const CONNECTED = {
  account_id: 'account', credentials_valid: true, field_catalog: [], has_credentials: true,
  pages_url: 'https://working-memory.pages.dev', project_name: 'working-memory',
  site_address: 'https://working-memory.pages.dev', updated_at: '2026-07-23T00:00:00.000Z'
};

beforeEach(() => {
  Object.values(runtime).forEach((mock) => mock.mockReset());
  openExternalUrl.mockReset();
  runtime.loadFoliolePublishSettingsFromRuntime.mockResolvedValue(CONNECTED);
  runtime.loadFoliolePublishSiteTitleFromRuntime.mockResolvedValue({ site_title: '' });
  runtime.loadFoliolePublishThemeFromRuntime.mockResolvedValue({
    active_theme: 'foliole', custom_theme: null, official_theme_version: 4
  });
  runtime.saveFoliolePublishSiteTitleToRuntime.mockImplementation(async (title: string) => ({ site_title: title.trim() }));
  runtime.updateFoliolePublishLocalPagesFromRuntime.mockResolvedValue({ local_path: '/Publish/Site/index.html' });
});

function renderSettings() {
  return renderWithLocalization(
    <AppConfirmationProvider><FoliolePublishingSettings expanded onExpandedChange={vi.fn()} /></AppConfirmationProvider>
  );
}

it('keeps site actions clickable and focuses the required empty title', async () => {
  renderSettings();
  const title = await screen.findByLabelText('Public site title');

  for (const name of ['View local', 'View Web', 'Update local', 'Update Web', 'Visit']) {
    fireEvent.click(screen.getByRole('button', { name }));
    expect(await screen.findByText('Enter a site title.')).toBeVisible();
    await waitFor(() => expect(title).toHaveFocus());
  }
  expect(runtime.viewFoliolePublishSiteFromRuntime).not.toHaveBeenCalled();
  expect(runtime.updateFoliolePublishLocalPagesFromRuntime).not.toHaveBeenCalled();
  expect(runtime.publishFoliolePublishThemeChangesFromRuntime).not.toHaveBeenCalled();
  expect(openExternalUrl).not.toHaveBeenCalled();
});

it('saves the normalized title before running the requested action', async () => {
  renderSettings();
  const title = await screen.findByLabelText('Public site title');
  fireEvent.change(title, { target: { value: '  Working Memory  ' } });
  fireEvent.click(screen.getByRole('button', { name: 'Update local' }));

  await waitFor(() => expect(runtime.saveFoliolePublishSiteTitleToRuntime).toHaveBeenCalledWith('Working Memory'));
  await waitFor(() => expect(runtime.updateFoliolePublishLocalPagesFromRuntime).toHaveBeenCalledOnce());
  expect(title).toHaveValue('Working Memory');
  expect(screen.queryByText('Enter a site title.')).toBeNull();
});
