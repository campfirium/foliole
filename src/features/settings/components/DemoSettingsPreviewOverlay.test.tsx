import { fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';

import { DemoSettingsPreviewOverlay } from './DemoSettingsPreviewOverlay';
import { renderWithMouseGestureProvider } from './SettingsPanel.testUtils';

import { APP_COMMAND_IDS } from '@/shared/commands/ids';
import { preloadTranslationCatalog } from '@/shared/localization/translations';
import { resetExternalFolderRuntimeProviderForTest } from '@/shared/platform/externalFolderRuntime';
import { resetExternalSourceSettingsFoldersCacheForTest } from '@/shared/platform/externalSourceSettingsRepository';

beforeAll(async () => {
  await preloadTranslationCatalog('en');
});

afterEach(() => {
  resetExternalFolderRuntimeProviderForTest();
  resetExternalSourceSettingsFoldersCacheForTest();
});

it('uses the real desktop settings panel and exposes the persistent language selection', async () => {
  renderWithMouseGestureProvider(
    <DemoSettingsPreviewOverlay onClose={vi.fn()} requestedCategory="general" />
  );

  expect(await screen.findByText('Desktop Settings Preview')).toBeInTheDocument();
  expect(screen.getByText('This panel shows the full desktop settings, so you can understand Foliole’s feature structure. Changes here do not affect the online demo.')).toBeInTheDocument();
  const dialog = document.querySelector('[data-settings-root-dialog="true"]');
  expect(dialog).not.toHaveAttribute('data-settings-desktop-preview');
  expect(dialog).toHaveClass('w-[min(1240px,calc(100vw-36px))]');
  expect(dialog).toHaveClass('rounded-lg');
  expect(screen.getByRole('textbox', { name: 'Search settings' })).toBeInTheDocument();
  expect(screen.getByRole('combobox', { name: 'App language' })).toBeInTheDocument();

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

it('shows the complete Publish settings preview without requiring a host runtime', async () => {
  renderWithMouseGestureProvider(
    <DemoSettingsPreviewOverlay onClose={vi.fn()} requestedCategory="publishing" />
  );

  expect(await screen.findByRole('heading', { name: 'Publish to the site' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Publish to WordPress' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Publish to Discourse' })).toBeInTheDocument();
  expect(screen.getByText('Desktop Settings Preview')).toBeInTheDocument();
});

it('keeps external folders in the Live Demo settings preview', async () => {
  renderWithMouseGestureProvider(
    <DemoSettingsPreviewOverlay onClose={vi.fn()} requestedCategory="external-search" />
  );

  expect((await screen.findAllByRole('heading', { name: 'External folders' })).length).toBeGreaterThan(0);
  expect(screen.getByRole('button', { name: 'External folders' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Add folder' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Choose folder' })).toBeInTheDocument();
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
  expect(screen.queryByText(/^Version /)).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Check for Updates' })).not.toBeInTheDocument();
});
