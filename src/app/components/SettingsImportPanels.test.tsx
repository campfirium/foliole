import { fireEvent, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import {
  applyReadwiseRootPath,
  createDefaultImportManagerSettings
} from '../../../lib/core/import/importManagerSettings';
import { renderWithLocalization } from '../../shared/localization/testLocalization';

const folderSelection = vi.hoisted(() => ({ selectRuntimeFolder: vi.fn() }));
const watchedBindings = vi.hoisted(() => ({ load: vi.fn() }));

vi.mock('../../shared/platform/folderSelectionRuntimeRepository', () => folderSelection);
vi.mock('../../shared/platform/import/watchedFolderRuntimeRepository', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../shared/platform/import/watchedFolderRuntimeRepository')>(),
  loadWatchedFolderBindingsFromRuntime: watchedBindings.load
}));

import { SettingsImportManagementContent } from './SettingsImportManagementContent';
import { SettingsReadwiseReaderContent } from './SettingsReadwiseReaderContent';

it('shows watched folders directly in settings', () => {
  watchedBindings.load.mockResolvedValue({ bindings: [], merged_local_rule_ids: [],
    current_host_name: '', current_device_identity_key: null });
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

it('shows a merged local watched source only through its selected workgroup source', async () => {
  watchedBindings.load.mockResolvedValue({ bindings: [],
    merged_local_rule_ids: ['draft-import-source-102'],
    current_host_name: 'Mac', current_device_identity_key: 'mac' });
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

  await waitFor(() => expect(screen.getAllByRole('button', { name: /Original folder/ })).toHaveLength(1));
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
  expect(screen.queryByText('Clean up imports')).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Import rules' })).toBeInTheDocument();
  expect(screen.getByText('Set import types and destinations.')).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Manual import' })).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Import settings' })).toBeInTheDocument();
  expect(screen.getByRole('combobox', { name: 'Articles with highlights destination' })).toBeInTheDocument();
  expect(screen.getByRole('combobox', { name: 'Articles without highlights destination' })).toBeInTheDocument();
  expect(screen.getByRole('combobox', { name: 'Books with highlights destination' })).toBeInTheDocument();
  expect(screen.getByRole('combobox', { name: 'Books without highlights destination' })).toBeInTheDocument();
  expect(screen.getByRole('combobox', { name: 'Sync frequency' })).toHaveValue('hourly');
  expect(screen.queryByLabelText('Readwise import scope')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Sync now' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Preview' })).toBeDisabled();
  expect(
    screen
      .getByRole('button', { name: 'Sync now' })
      .compareDocumentPosition(screen.getByRole('heading', { name: 'Import rules' }))
  ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  expect(
    screen
      .getByRole('combobox', { name: 'Articles with highlights destination' })
      .compareDocumentPosition(screen.getByText('Readwise root folder'))
  ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
});

it('saves a new Readwise root and invalidates the previous enabled setup', async () => {
  const settings = createDefaultImportManagerSettings();
  settings.readwiseRootPath = '/Library/Readwise/old';
  settings.readwiseSources = applyReadwiseRootPath(
    settings.readwiseSources,
    settings.readwiseRootPath
  );
  settings.readwiseReaderConfig = {
    ...settings.readwiseReaderConfig,
    enabled: true,
    validatedAt: '2026-08-01T00:00:00.000Z'
  };
  folderSelection.selectRuntimeFolder.mockResolvedValue('/Library/Readwise/clip');
  const onSave = vi.fn();

  renderWithLocalization(
    <SettingsReadwiseReaderContent
      config={settings.readwiseReaderConfig}
      onSave={onSave}
      readwiseRootPath={settings.readwiseRootPath}
      readwiseSources={settings.readwiseSources}
    />
  );
  fireEvent.click(screen.getByRole('button', { name: 'Readwise root folder' }));

  await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
  expect(onSave).toHaveBeenCalledWith(
    expect.objectContaining({
      config: expect.objectContaining({ enabled: false, validatedAt: '' }),
      readwiseRootPath: '/Library/Readwise/clip',
      readwiseSources: expect.arrayContaining([
        expect.objectContaining({
          highlightPath: '/Library/Readwise/clip/Articles',
          primaryPath: '/Library/Readwise/clip/Full Document Contents/Articles'
        })
      ])
    })
  );
});
