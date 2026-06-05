import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../../../../shared/config/appSettings';
import { renderWithLocalization } from '../../../../shared/localization/testLocalization';

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
  onUpdateFolder: vi.fn()
};

beforeEach(() => {
  window.localStorage.clear();
  vi.clearAllMocks();
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

it('describes external folders as mirrored sources', () => {
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

  expect(screen.getByText('Choose folders Foliole mirrors for browsing, search, and import. Original files stay outside Foliole.')).toBeInTheDocument();
  expect(screen.getByTitle('3 files mirrored')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Update folder mirror' })).toBeInTheDocument();
});

it('does not show global search enhancement controls in external sources', () => {
  renderWithLocalization(<SettingsExternalSearchSection {...baseProps} />);

  expect(screen.queryByText('Search enhancement')).not.toBeInTheDocument();
  expect(screen.queryByText('Full-text search index')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Search text strategy')).not.toBeInTheDocument();
});

it('shows a retryable alert when external sources fail to load', () => {
  renderWithLocalization(<SettingsExternalSearchSection {...baseProps} error="Could not load external folders." />);

  expect(screen.getByRole('alert')).toHaveTextContent('Could not load external folders.');
  expect(screen.getByRole('alert')).toHaveTextContent('External folders unavailable');

  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

  expect(baseProps.onRetryLoad).toHaveBeenCalledTimes(1);
});

it('disables external folder controls without saving folder changes when turned off', () => {
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

  expect(screen.getByRole('button', { name: 'Choose folder' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Update folder mirror' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Remove folder' })).toBeDisabled();
  expect(screen.getByLabelText('Excluded folder names for D:\\Docs')).toBeDisabled();
  expect(onUpdateFolder).not.toHaveBeenCalled();
});
