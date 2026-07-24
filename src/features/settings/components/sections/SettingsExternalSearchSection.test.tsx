import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../../../../shared/config/appSettings';
import { renderWithLocalization } from '../../../../shared/localization/testLocalization';
import type { ExternalSourceSettingsFolder } from '../../../../shared/platform/externalSourceSettingsRepository';

import { SettingsExternalSearchSection } from './SettingsExternalSearchSection';

const baseProps = {
  error: null,
  feedback: null,
  folders: [],
  isDesktopRuntime: true,
  isLoading: false,
  isSaving: false,
  onAddFolder: vi.fn(),
  onChooseAttachmentRoot: vi.fn(),
  onChooseFolder: vi.fn(),
  onRebuildIndex: vi.fn(),
  onRemoveFolder: vi.fn(),
  onRetryLoad: vi.fn(),
  onSetFolderEnabled: vi.fn(),
  onUpdateFolder: vi.fn()
};

function remoteFolder(overrides: Partial<ExternalSourceSettingsFolder> = {}): ExternalSourceSettingsFolder {
  return {
    accessMode: 'remote_mirror',
    attachmentMode: 'document_relative_first_then_fixed_root',
    attachmentRootPath: null,
    createdAt: '2026-07-24T00:00:00.000Z',
    documentCount: 2,
    excludedDirs: [],
    folderPath: 'D:\\Docs',
    id: 'remote-1',
    indexedAt: '2026-07-24T00:00:00.000Z',
    lastError: null,
    mirrorEnabled: true,
    ownerDeviceName: 'Windows PC',
    ownerInstallationId: 'windows-1',
    ownerPlatform: 'win32',
    status: 'ready',
    updatedAt: '2026-07-24T00:00:00.000Z',
    ...overrides
  };
}

beforeEach(() => {
  window.localStorage.clear();
  vi.clearAllMocks();
});

it('shows remote mirrors only when a remote desktop folder exists', () => {
  renderWithLocalization(<SettingsExternalSearchSection {...baseProps} folders={[remoteFolder()]} />);

  expect(screen.getByText('From other devices')).toBeInTheDocument();
  expect(screen.getByText('Browse and search these folders on this device. They’re read-only here.')).toBeInTheDocument();
  expect(screen.getByText('Windows PC')).toBeInTheDocument();
  expect(screen.getByText('Windows')).toBeInTheDocument();
  expect(screen.getByText('Docs')).toBeInTheDocument();
  expect(screen.queryByText('Read-only mirror')).not.toBeInTheDocument();
  const remoteHeading = screen.getByRole('heading', { level: 3, name: 'From other devices' });
  const localHeading = screen.getByRole('heading', { level: 3, name: 'External folders' });
  expect(remoteHeading.compareDocumentPosition(localHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  fireEvent.click(screen.getByRole('switch', { name: 'Use Docs from Windows PC on this device' }));
  expect(baseProps.onSetFolderEnabled).toHaveBeenCalledWith('remote-1', false);
  expect(screen.queryByRole('button', { name: 'Update folder' })).not.toBeInTheDocument();
});

it('groups by installation and exposes a mixed device control without guessing missing ownership', () => {
  renderWithLocalization(<SettingsExternalSearchSection {...baseProps} folders={[
    remoteFolder(),
    remoteFolder({ folderPath: 'D:\\Projects', id: 'remote-2', mirrorEnabled: false }),
    remoteFolder({ folderPath: '/Users/foliole/Research', id: 'remote-3', ownerInstallationId: 'mac-1', ownerPlatform: 'darwin' }),
    remoteFolder({ folderPath: '/unknown', id: 'remote-4', ownerDeviceName: null, ownerInstallationId: null, ownerPlatform: 'mystery' })
  ]} />);

  const sameNameGroupControls = screen.getAllByRole('checkbox', { name: 'Use all folders from Windows PC on this device' });
  const firstGroupControl = sameNameGroupControls[0];
  expect(sameNameGroupControls).toHaveLength(2);
  if (!firstGroupControl) throw new Error('missing first Windows PC group control');
  expect(firstGroupControl).toHaveAttribute('aria-checked', 'mixed');
  expect(screen.getByRole('checkbox', { name: 'Use all folders from Other device on this device' })).toBeInTheDocument();
  expect(screen.queryByText('mystery')).not.toBeInTheDocument();

  fireEvent.click(firstGroupControl);
  expect(baseProps.onSetFolderEnabled).toHaveBeenCalledWith(['remote-1', 'remote-2'], true);
});

it('does not show link panel browsing data controls in external sources', () => {
  renderWithLocalization(<SettingsExternalSearchSection {...baseProps} />);

  expect(screen.queryByText('Link panel browsing data')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Clear link panel browsing data' })).not.toBeInTheDocument();
});

it('shows a progress row while external sources load', () => {
  renderWithLocalization(<SettingsExternalSearchSection {...baseProps} isLoading />);

  const status = screen.getByRole('status');
  expect(status).toHaveAttribute('aria-busy', 'true');
  expect(status).toHaveTextContent('');
});

it('describes External folders without mirror terminology', () => {
  renderWithLocalization(<SettingsExternalSearchSection {...baseProps} folders={[{
    attachmentMode: 'document_relative_first_then_fixed_root',
    attachmentRootPath: null,
    createdAt: '2026-05-26T00:00:00.000Z',
    documentCount: 3,
    excludedDirs: [],
    folderPath: 'D:\\Docs',
    id: 'folder-1',
    indexedAt: '2026-05-26T00:00:00.000Z',
    lastError: null,
    status: 'ready',
    updatedAt: '2026-05-26T00:00:00.000Z'
  }]} />);

  expect(screen.getByText('Choose folders to browse, search, and import from outside Foliole. Original files stay outside Foliole.')).toBeInTheDocument();
  expect(screen.getByTitle('3 files indexed')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Update folder' })).toBeInTheDocument();
});

it('does not show global search enhancement controls in external sources', () => {
  renderWithLocalization(<SettingsExternalSearchSection {...baseProps} />);

  expect(screen.queryByText('Search enhancement')).not.toBeInTheDocument();
  expect(screen.queryByText('Full-text search index')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Search text strategy')).not.toBeInTheDocument();
});

it('shows a retryable alert when external sources fail to load', () => {
  renderWithLocalization(<SettingsExternalSearchSection {...baseProps} error="Could not load external folder settings." />);

  expect(screen.getByRole('alert')).toHaveTextContent('Could not load external folder settings.');
  expect(screen.getByRole('alert')).toHaveTextContent('External folders unavailable');

  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

  expect(baseProps.onRetryLoad).toHaveBeenCalledTimes(1);
});

it('keeps external folder controls available when the legacy enabled flag is false', () => {
  const onUpdateFolder = vi.fn();
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.externalFoldersEnabled, 'false');
  renderWithLocalization(<SettingsExternalSearchSection {...baseProps} folders={[{
    attachmentMode: 'document_relative_first_then_fixed_root',
    attachmentRootPath: null,
    createdAt: '2026-05-26T00:00:00.000Z',
    documentCount: 3,
    excludedDirs: [],
    folderPath: 'D:\\Docs',
    id: 'folder-1',
    indexedAt: '2026-05-26T00:00:00.000Z',
    lastError: null,
    status: 'ready',
    updatedAt: '2026-05-26T00:00:00.000Z'
  }]} onUpdateFolder={onUpdateFolder} />);

  expect(screen.getByRole('button', { name: 'Choose folder' })).not.toBeDisabled();
  expect(screen.getByRole('button', { name: 'Update folder' })).not.toBeDisabled();
  expect(screen.getByRole('button', { name: 'Remove folder' })).not.toBeDisabled();
  expect(screen.getByLabelText('Excluded folder names for D:\\Docs')).not.toBeDisabled();
  expect(onUpdateFolder).not.toHaveBeenCalled();
});
