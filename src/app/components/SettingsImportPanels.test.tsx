import { screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { createDefaultImportManagerSettings } from '../../../lib/core/import/importManagerSettings';
import { renderWithLocalization } from '../../shared/localization/testLocalization';

import { SettingsImportManagementContent } from './SettingsImportManagementContent';
import { SettingsReadwiseReaderContent } from './SettingsReadwiseReaderContent';

it('shows watched folders directly in settings', () => {
  const settings = createDefaultImportManagerSettings();

  renderWithLocalization(
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

  expect(screen.getByText('Watched folders')).toBeInTheDocument();
  expect(screen.getByRole('table', { name: 'Watched folders' })).toBeInTheDocument();
  expect(screen.getByText('Original')).toBeInTheDocument();
  expect(screen.getByText('Highlight')).toBeInTheDocument();
  expect(screen.getByText('Handling')).toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: /Original folder/ }).length).toBeGreaterThan(0);
  expect(screen.getAllByRole('button', { name: /Preview/ }).length).toBeGreaterThan(0);
});

it('shows the restored Readwise Reader setup directly in settings', () => {
  const settings = createDefaultImportManagerSettings();

  renderWithLocalization(
    <SettingsReadwiseReaderContent
      config={settings.readwiseReaderConfig}
      onSave={vi.fn()}
      readwiseRootPath={settings.readwiseRootPath}
      readwiseSources={settings.readwiseSources}
    />
  );

  expect(screen.getByText('Readwise Reader Import')).toBeInTheDocument();
  expect(screen.getByText('Readwise root folder')).toBeInTheDocument();
  expect(screen.getByText('Clean up imports')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Import behavior' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Import settings' })).toBeInTheDocument();
  expect(
    screen.getByText('Highlighted Readwise Reader content can go to Inbox or be added to the external document library.')
  ).toBeInTheDocument();
  expect(
    screen.getByText(
      'Readwise Reader content without highlights can go to Inbox, be added to the external document library, or be left unhandled.'
    )
  ).toBeInTheDocument();
  expect(
    screen.getByRole('radiogroup', { name: 'Highlighted content destination' })
  ).toBeInTheDocument();
  expect(
    screen.getByRole('radiogroup', { name: 'Content without highlights destination' })
  ).toBeInTheDocument();
  expect(screen.getByRole('combobox', { name: 'Sync frequency' })).toHaveValue('hourly');
  expect(screen.queryByLabelText('Readwise import scope')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Sync' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Preview' })).toBeDisabled();
  expect(
    screen
      .getByRole('button', { name: 'Sync' })
      .compareDocumentPosition(screen.getByRole('heading', { name: 'Import behavior' }))
  ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  expect(
    screen
      .getByText('Highlighted content')
      .compareDocumentPosition(screen.getByText('Readwise root folder'))
  ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
});
