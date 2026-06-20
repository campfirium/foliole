import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';

import { DemoSettingsPreviewOverlay } from './DemoSettingsPreviewOverlay';

import { ExternalFoldersSettingsProvider } from '@/features/settings/context/ExternalFoldersSettingsProvider';
import { LocalizationProvider } from '@/shared/localization/LocalizationProvider';
import { preloadTranslationCatalog } from '@/shared/localization/translations';
import {
  resetExternalSourceSettingsFoldersCacheForTest,
  type ExternalSourceSettingsFolder
} from '@/shared/platform/externalSourceSettingsRepository';
import {
  installExternalFolderRuntimeProvider,
  resetExternalFolderRuntimeProviderForTest,
  type ExternalFolderRuntimeProvider
} from '@/shared/platform/runtime/externalFolderRuntime';

beforeAll(async () => {
  await preloadTranslationCatalog('en');
});

afterEach(() => {
  resetExternalFolderRuntimeProviderForTest();
  resetExternalSourceSettingsFoldersCacheForTest();
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

it('renders external document mirrors as an actionable Web demo settings section', async () => {
  installExternalFolderRuntimeProvider(createEmptyExternalFolderProvider());
  render(
    <LocalizationProvider initialLanguagePreference="en">
      <ExternalFoldersSettingsProvider>
        <DemoSettingsPreviewOverlay onClose={vi.fn()} requestedCategory="external-search" />
      </ExternalFoldersSettingsProvider>
    </LocalizationProvider>
  );

  expect(await screen.findByText('The Web demo can choose a top-level local folder in supported browsers. Folder access is session-only and does not scan subfolders.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Add folder' })).not.toBeDisabled();
});

function createEmptyExternalFolderProvider(): ExternalFolderRuntimeProvider {
  const folders: ExternalSourceSettingsFolder[] = [];
  return {
    importDocument: () => Promise.resolve(null),
    loadBrowseEntries: () => Promise.resolve([]),
    loadFolders: () => Promise.resolve(folders),
    loadPreview: () => Promise.resolve(null),
    rebuildIndex: () => Promise.resolve(folders),
    saveFolders: () => Promise.resolve(folders),
    selectFolderPath: () => Promise.resolve(null),
    subscribeFolders: () => () => undefined
  };
}
