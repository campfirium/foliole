import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { clearLinkPanelBrowsingData } from '../../../../shared/platform/linkPanelBrowsingData';

import { SettingsExternalSearchSection } from './SettingsExternalSearchSection';

vi.mock('../../../../shared/platform/linkPanelBrowsingData', () => ({
  clearLinkPanelBrowsingData: vi.fn()
}));

const clearLinkPanelBrowsingDataMock = vi.mocked(clearLinkPanelBrowsingData);

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
  vi.clearAllMocks();
  clearLinkPanelBrowsingDataMock.mockResolvedValue('cleared');
});

it('clears link panel browsing data from the external sources section', async () => {
  render(<SettingsExternalSearchSection {...baseProps} />);

  fireEvent.click(screen.getByRole('button', { name: 'Clear link panel browsing data' }));

  await waitFor(() => {
    expect(clearLinkPanelBrowsingDataMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Link panel browsing data cleared.')).toBeInTheDocument();
  });
});

it('keeps the link panel browsing data action desktop-only', () => {
  render(<SettingsExternalSearchSection {...baseProps} isDesktopRuntime={false} />);

  expect(screen.getByRole('button', { name: 'Clear link panel browsing data' })).toBeDisabled();
});

it('shows a progress row while external sources load', () => {
  render(<SettingsExternalSearchSection {...baseProps} isLoading />);

  const status = screen.getByRole('status');
  expect(status).toHaveAttribute('aria-busy', 'true');
  expect(status).toHaveTextContent('');
});

it('describes external folders as mirrored sources', () => {
  render(<SettingsExternalSearchSection {...baseProps} folders={[{
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
  render(<SettingsExternalSearchSection {...baseProps} />);

  expect(screen.queryByText('Search enhancement')).not.toBeInTheDocument();
  expect(screen.queryByText('Full-text search index')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Search text strategy')).not.toBeInTheDocument();
});

it('shows a retryable alert when external sources fail to load', () => {
  render(<SettingsExternalSearchSection {...baseProps} error="Could not load the external library." />);

  expect(screen.getByRole('alert')).toHaveTextContent('Could not load the external library.');
  expect(screen.getByRole('alert')).toHaveTextContent('External sources unavailable');

  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

  expect(baseProps.onRetryLoad).toHaveBeenCalledTimes(1);
});
