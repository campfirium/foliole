import { render, screen, within } from '@testing-library/react';
import { beforeAll, expect, it, vi } from 'vitest';

import { DemoSettingsPreviewOverlay } from './DemoSettingsPreviewOverlay';

import { LocalizationProvider } from '@/shared/localization/LocalizationProvider';
import { preloadTranslationCatalog } from '@/shared/localization/translations';

beforeAll(async () => {
  await preloadTranslationCatalog('en');
});

it('renders the demo note after the original setting description', async () => {
  render(
    <LocalizationProvider initialLanguagePreference="en">
      <DemoSettingsPreviewOverlay onClose={vi.fn()} requestedCategory="general" />
    </LocalizationProvider>
  );

  const languageRow = await screen.findByText('App language');
  const row = languageRow.closest('[data-settings-row]');
  if (!row) {
    throw new Error('Expected settings row.');
  }

  expect(within(row).getByText('Choose the language used by Foliole interface text.')).toBeInTheDocument();
  expect(within(row).getByText('Web demo note:')).toBeInTheDocument();
  expect(within(row).getByText('Shown to match the desktop settings. Changes are not applied in this Web demo.')).toBeInTheDocument();
});

it('does not duplicate the note on status rows that already label desktop-only controls', async () => {
  render(
    <LocalizationProvider initialLanguagePreference="en">
      <DemoSettingsPreviewOverlay onClose={vi.fn()} requestedCategory="about" />
    </LocalizationProvider>
  );

  const versionRow = (await screen.findByText('Up to date')).closest('[data-settings-row]');
  if (!versionRow) {
    throw new Error('Expected settings row.');
  }

  expect(within(versionRow).queryByText('Web demo note:')).not.toBeInTheDocument();
});
