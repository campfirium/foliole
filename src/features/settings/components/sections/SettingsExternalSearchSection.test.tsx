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

it('shows a loading row while external sources load', () => {
  render(<SettingsExternalSearchSection {...baseProps} isLoading />);

  expect(screen.getByText('Loading external sources')).toBeInTheDocument();
  expect(screen.getByText('Loading external source folders.')).toBeInTheDocument();
});

it('shows a retryable alert when external sources fail to load', () => {
  render(<SettingsExternalSearchSection {...baseProps} error="Could not load the external library." />);

  expect(screen.getByRole('alert')).toHaveTextContent('Could not load the external library.');

  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

  expect(baseProps.onRetryLoad).toHaveBeenCalledTimes(1);
});
