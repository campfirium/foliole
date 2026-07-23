import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../../../../shared/localization/testLocalization';
import { AppConfirmationProvider } from '../../../../shared/ui';

import { FoliolePublishingSettings } from './FoliolePublishingSettings';

const runtime = vi.hoisted(() => ({
  connectFoliolePublishSettingsToRuntime: vi.fn(), disconnectFoliolePublishSettingsFromRuntime: vi.fn(),
  loadFoliolePublishSettingsFromRuntime: vi.fn(), loadFoliolePublishSiteTitleFromRuntime: vi.fn(),
  loadFoliolePublishThemeFromRuntime: vi.fn(), openFoliolePublishCustomThemeFromRuntime: vi.fn(),
  publishFoliolePublishThemeChangesFromRuntime: vi.fn(), saveFoliolePublishDraftToRuntime: vi.fn(),
  saveFoliolePublishSiteTitleToRuntime: vi.fn(), updateFoliolePublishLocalPagesFromRuntime: vi.fn(),
  updateFoliolePublishSiteAddressInRuntime: vi.fn(), useFoliolePublishThemeFromRuntime: vi.fn(),
  viewFoliolePublishSiteFromRuntime: vi.fn()
}));
vi.mock('../../../../shared/platform/foliolePublishRepository', () => runtime);
vi.mock('../../../../shared/platform/external/linkPanelUrlProbe', () => ({ probeUrlWithLinkPanel: vi.fn() }));
vi.mock('../../../../shared/platform/runtimeExternalNavigation', () => ({ openExternalUrl: vi.fn() }));

const SETTINGS = {
  account_id: 'account', credentials_valid: true, field_catalog: [], has_credentials: true,
  pages_url: 'https://site.pages.dev', project_name: 'site', site_address: 'https://site.pages.dev', updated_at: null
};
const FOLIOLE = { active_theme: 'foliole' as const, custom_theme: null, official_theme_version: 4 };
const CUSTOM = {
  active_theme: 'custom' as const, custom_theme: { based_on_official_version: 4 }, official_theme_version: 4
};

beforeEach(() => {
  Object.values(runtime).forEach((mock) => mock.mockReset());
  runtime.loadFoliolePublishSettingsFromRuntime.mockResolvedValue(SETTINGS);
  runtime.loadFoliolePublishSiteTitleFromRuntime.mockResolvedValue({ site_title: 'Foliole' });
  runtime.loadFoliolePublishThemeFromRuntime.mockResolvedValue(FOLIOLE);
  runtime.saveFoliolePublishSiteTitleToRuntime.mockResolvedValue({ site_title: 'Foliole' });
  runtime.openFoliolePublishCustomThemeFromRuntime.mockResolvedValue({ local_path: '/Publish/Theme', theme: CUSTOM });
  runtime.useFoliolePublishThemeFromRuntime.mockResolvedValue({ theme: { ...FOLIOLE, custom_theme: CUSTOM.custom_theme } });
  runtime.updateFoliolePublishLocalPagesFromRuntime.mockResolvedValue({ local_path: '/Publish/Site/index.html' });
  runtime.publishFoliolePublishThemeChangesFromRuntime.mockResolvedValue({ local_path: '/Publish/Site/index.html' });
});

function renderSettings() {
  return renderWithLocalization(
    <AppConfirmationProvider><FoliolePublishingSettings expanded onExpandedChange={vi.fn()} /></AppConfirmationProvider>
  );
}

it('uses one versioned theme selector while keeping both update actions', async () => {
  renderSettings();
  expect(await screen.findByText('Set the publishing page theme.')).toBeVisible();
  expect(screen.getByRole('radio', { name: 'Default v4' })).toBeChecked();
  const custom = screen.getByRole('radio', { name: 'Custom v4' });
  fireEvent.click(custom);
  await waitFor(() => expect(custom).toBeChecked());
  expect(runtime.openFoliolePublishCustomThemeFromRuntime).toHaveBeenCalledOnce();
  fireEvent.click(custom);
  await waitFor(() => expect(runtime.openFoliolePublishCustomThemeFromRuntime).toHaveBeenCalledTimes(2));

  fireEvent.click(screen.getByRole('button', { name: 'Update local' }));
  await waitFor(() => expect(runtime.updateFoliolePublishLocalPagesFromRuntime).toHaveBeenCalledOnce());
  expect(runtime.publishFoliolePublishThemeChangesFromRuntime).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Update Web' }));
  await waitFor(() => expect(runtime.publishFoliolePublishThemeChangesFromRuntime).toHaveBeenCalledOnce());

  fireEvent.click(screen.getByRole('radio', { name: 'Default v4' }));
  await waitFor(() => expect(runtime.useFoliolePublishThemeFromRuntime).toHaveBeenCalledOnce());
  expect(screen.getByRole('radio', { name: 'Default v4' })).toBeChecked();
  expect(screen.queryByText(/Using (Foliole|Custom) Theme/u)).not.toBeInTheDocument();
});

it('does not invent a base version for a migrated Custom Theme', async () => {
  runtime.loadFoliolePublishThemeFromRuntime.mockResolvedValue({
    active_theme: 'custom', custom_theme: { based_on_official_version: null }, official_theme_version: 4
  });
  renderSettings();
  expect(await screen.findByRole('radio', { name: 'Custom' })).toBeChecked();
  expect(screen.queryByRole('radio', { name: 'Custom v4' })).not.toBeInTheDocument();
});
