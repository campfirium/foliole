import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { createDefaultImportManagerSettings } from '../../../lib/core/import/importManagerSettings';

import { SettingsImportManagementContent } from './SettingsImportManagementContent';
import { SettingsReadwiseReaderContent } from './SettingsReadwiseReaderContent';

it('shows the restored import management table directly in settings', () => {
  const settings = createDefaultImportManagerSettings();

  render(
    <SettingsImportManagementContent
      onChange={() => undefined}
      onChangeAction={() => undefined}
      onChangeTitleStrategy={() => undefined}
      onChooseHighlightFolder={() => undefined}
      onChoosePrimaryFolder={() => undefined}
      onCopySource={() => undefined}
      onDeleteSource={() => undefined}
      onDisableKeepImport={() => undefined}
      onPreviewKeepImport={() => undefined}
      sources={settings.sources}
      titleStrategy={settings.titleStrategy}
    />
  );

  expect(screen.getByText('Source folders')).toBeInTheDocument();
  expect(screen.getAllByText('Original folder').length).toBeGreaterThan(0);
  expect(screen.getAllByText('Highlight folder').length).toBeGreaterThan(0);
  expect(screen.getAllByText('Handling').length).toBeGreaterThan(0);
  expect(screen.getAllByText('Keep import').length).toBeGreaterThan(0);
});

it('shows the restored Readwise Reader setup directly in settings', () => {
  const settings = createDefaultImportManagerSettings();

  render(
    <SettingsReadwiseReaderContent
      config={settings.readwiseReaderConfig}
      onSave={vi.fn()}
      readwiseRootPath={settings.readwiseRootPath}
      readwiseSources={settings.readwiseSources}
    />
  );

  expect(screen.getByText('Readwise Reader setup')).toBeInTheDocument();
  expect(screen.getByText('Readwise root folder')).toBeInTheDocument();
  expect(screen.getByLabelText('Readwise import scope')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Preview setup' })).toBeDisabled();
});
