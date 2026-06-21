import { fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';

import { DemoSettingsPreviewOverlay } from './DemoSettingsPreviewOverlay';
import { renderWithMouseGestureProvider } from './SettingsPanel.testUtils';

import { APP_COMMAND_IDS } from '@/shared/commands/ids';
import { preloadTranslationCatalog } from '@/shared/localization/translations';
import { resetExternalSourceSettingsFoldersCacheForTest } from '@/shared/platform/externalSourceSettingsRepository';
import { resetExternalFolderRuntimeProviderForTest } from '@/shared/platform/runtime/externalFolderRuntime';

beforeAll(async () => {
  await preloadTranslationCatalog('en');
});

afterEach(() => {
  resetExternalFolderRuntimeProviderForTest();
  resetExternalSourceSettingsFoldersCacheForTest();
});

it('uses the real desktop settings panel while hiding only the language setting', async () => {
  renderWithMouseGestureProvider(
    <DemoSettingsPreviewOverlay onClose={vi.fn()} requestedCategory="general" />
  );

  expect(await screen.findByText('Desktop settings preview')).toBeInTheDocument();
  expect(screen.getByText('Live Demo shows these desktop app controls as a preview.')).toBeInTheDocument();
  expect(screen.queryByText('App language')).not.toBeInTheDocument();

  const startupSwitch = await screen.findByRole('switch', { name: 'Start Foliole automatically' });
  expect(startupSwitch).toHaveAttribute('aria-checked', 'false');
  fireEvent.click(startupSwitch);
  expect(startupSwitch).toHaveAttribute('aria-checked', 'true');

  expect(screen.getByRole('combobox', { name: 'Full-text search language' })).toBeInTheDocument();
});

it('keeps the real hotkey settings surface in the Live Demo preview', async () => {
  renderWithMouseGestureProvider(
    <DemoSettingsPreviewOverlay onClose={vi.fn()} requestedCategory="hotkeys" />,
    {
      hotkeySettings: {
        hotkeyItems: [{
          commandId: 'workspace.openSettings',
          isCustomized: false,
          primaryShortcutLabel: 'Ctrl+,',
          secondaryShortcutLabel: '',
          shortcutSummaryLabel: 'Ctrl+,',
          title: 'Open settings'
        }]
      }
    }
  );

  expect(await screen.findByText('Open settings')).toBeInTheDocument();
  expect(screen.getByText('Ctrl+,')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Add shortcut for Open settings' })).toBeInTheDocument();
});

it('hides external folders from the Live Demo settings preview', async () => {
  renderWithMouseGestureProvider(
    <DemoSettingsPreviewOverlay onClose={vi.fn()} requestedCategory="external-search" />
  );

  expect(await screen.findByRole('heading', { name: 'General' })).toBeInTheDocument();
  expect(screen.queryByText('External Folder')).toBeNull();
  expect(screen.queryByRole('switch', { name: 'Enable External Folder' })).toBeNull();
  expect(screen.queryByText('External Folder is available in the desktop app.')).not.toBeInTheDocument();
});

it('renders supplied Readwise settings content instead of the unavailable fallback', async () => {
  renderWithMouseGestureProvider(
    <DemoSettingsPreviewOverlay
      onClose={vi.fn()}
      readwiseReaderCategoryContent={<div>Readwise settings preview</div>}
      requestedCategory="readwise-reader"
    />
  );

  expect(await screen.findByText('Readwise settings preview')).toBeInTheDocument();
  expect(screen.queryByText('Readwise Reader content is not available yet.')).not.toBeInTheDocument();
});

it('keeps community links runnable in the Live Demo preview', async () => {
  const onRunSupportCommand = vi.fn();
  renderWithMouseGestureProvider(
    <DemoSettingsPreviewOverlay
      onClose={vi.fn()}
      onRunSupportCommand={onRunSupportCommand}
      requestedCategory="about"
    />
  );

  fireEvent.click(await screen.findByRole('button', { name: 'GitHub' }));
  expect(onRunSupportCommand).toHaveBeenCalledWith(APP_COMMAND_IDS.openGitHubRepository);
});
