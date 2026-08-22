import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../../../../shared/config/appSettings';
import { renderWithLocalization } from '../../../../shared/localization/testLocalization';
import { useActiveSyncGroupMembership } from '../../../../shared/platform/external/useActiveSyncGroupMembership';
import type { ExternalSourceSettingsFolder } from '../../../../shared/platform/externalSourceSettingsRepository';

import { SettingsExternalSearchSection } from './SettingsExternalSearchSection';

vi.mock('../../../../shared/platform/external/useActiveSyncGroupMembership', () => ({
  useActiveSyncGroupMembership: vi.fn()
}));

const activeSyncGroupMock = vi.mocked(useActiveSyncGroupMembership);

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
  onDisconnectFolder: vi.fn(),
  onReconnectFolder: vi.fn(),
  onRebuildIndex: vi.fn(),
  onRemoveFolder: vi.fn(),
  onReplaceHost: vi.fn(),
  onRetryLoad: vi.fn(),
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
    sourceExecutable: false,
    sourceHostName: '0cap',
    sourceHostPlatform: 'win32',
    status: 'ready',
    updatedAt: '2026-07-24T00:00:00.000Z',
    ...overrides
  };
}

beforeEach(() => {
  window.localStorage.clear();
  vi.clearAllMocks();
  activeSyncGroupMock.mockReturnValue(true);
});

it('shows remote mirrors only when a remote desktop folder exists', () => {
  renderWithLocalization(<SettingsExternalSearchSection {...baseProps} folders={[remoteFolder()]} />);

  expect(screen.getByText('Other hosts')).toBeInTheDocument();
  expect(screen.getByText('Path')).toBeInTheDocument();
  expect(screen.getByText('0cap')).toBeInTheDocument();
  expect(screen.getByText('Windows')).toBeInTheDocument();
  expect(screen.getByText('D:\\Docs')).toBeInTheDocument();
  expect(screen.queryByText('Read-only mirror')).not.toBeInTheDocument();
  expect(screen.queryByRole('heading', { level: 3, name: 'Other hosts' })).not.toBeInTheDocument();
  expect(screen.queryByRole('heading', { level: 3, name: 'External folders' })).not.toBeInTheDocument();
  expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Update folder' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Reconnect' })).not.toBeInTheDocument();
});

it('hides remote mirrors outside an active workgroup while keeping local controls', () => {
  activeSyncGroupMock.mockReturnValue(false);
  renderWithLocalization(<SettingsExternalSearchSection {...baseProps} folders={[remoteFolder()]} />);

  expect(screen.queryByText('Other hosts')).not.toBeInTheDocument();
  expect(screen.queryByText('0cap')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Add folder' })).toBeInTheDocument();
});

it('groups by Source Host without exposing receiver controls or guessing missing ownership', () => {
  renderWithLocalization(<SettingsExternalSearchSection {...baseProps} folders={[
    remoteFolder(),
    remoteFolder({ folderPath: 'D:\\Projects', id: 'remote-2', mirrorEnabled: false }),
    remoteFolder({ folderPath: '/Users/foliole/Research', id: 'remote-3', sourceHostName: 'Studio Mac', sourceHostPlatform: 'darwin' }),
    remoteFolder({ folderPath: '/unknown', id: 'remote-4', sourceHostName: '', sourceHostPlatform: 'mystery' })
  ]} />);

  expect(screen.getByText('0cap')).toBeInTheDocument();
  expect(screen.getByText('Studio Mac')).toBeInTheDocument();
  expect(screen.getByText('macOS')).toBeInTheDocument();
  expect(screen.getByText('Other host')).toBeInTheDocument();
  expect(screen.queryByText('mystery')).not.toBeInTheDocument();
  expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  const folderActions = screen.getByRole('button', { name: 'More actions for /unknown' });
  expect(folderActions).toHaveAttribute('aria-haspopup', 'menu');
  expect(screen.getByRole('button', { name: 'More actions for 0cap' })).toHaveAttribute('aria-haspopup', 'menu');
  expect(screen.getByRole('button', { name: 'More actions for D:\\Docs' })).toHaveAttribute('aria-haspopup', 'menu');
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

it('keeps local External folders controls without repeating the page description', () => {
  renderWithLocalization(<SettingsExternalSearchSection {...baseProps} folders={[{
    accessMode: 'local',
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

  expect(screen.queryByText('Choose folders to browse, search, and import from outside Foliole. Original files stay outside Foliole.')).not.toBeInTheDocument();
  expect(screen.getByTitle('3 files indexed')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Update folder' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Disconnect' })).toBeInTheDocument();
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
    accessMode: 'local',
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
