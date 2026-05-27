import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

vi.mock('../../../../shared/platform/diagnosticBundle', () => ({
  exportDiagnosticBundle: vi.fn()
}));

import { APP_SETTINGS_STORAGE_KEYS } from '../../../../shared/config/appSettings';
import { exportDiagnosticBundle } from '../../../../shared/platform/diagnosticBundle';

import { SettingsAboutSection } from './SettingsAboutSection';

beforeEach(() => {
  vi.mocked(exportDiagnosticBundle).mockReset();
  window.localStorage.clear();
});

it('shows application info and diagnostic export in the about section', async () => {
  vi.mocked(exportDiagnosticBundle).mockResolvedValue({
    filePath: '/Desktop/foliole-diagnostics.zip',
    includedFileCount: 3,
    status: 'exported'
  });
  render(<SettingsAboutSection />);

  expect(screen.getByText('Foliole desktop')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Export diagnostic bundle' }));
  await waitFor(() => {
    expect(exportDiagnosticBundle).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Diagnostic bundle exported with 3 files.')).toBeInTheDocument();
  });
  expect(screen.queryByText('/app/Backups')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Create backup' })).not.toBeInTheDocument();
});

it('shows the global search enhancement switch in General', () => {
  render(<SettingsAboutSection />);

  const toggle = screen.getByRole('switch', { name: 'Search enhancement' });
  const desktopTitle = screen.getByText('Foliole desktop');
  const searchTitle = screen.getByText('Search');
  expect(toggle).toHaveAttribute('aria-checked', 'false');
  expect(desktopTitle.compareDocumentPosition(searchTitle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(screen.getByText(/other languages that are not separated by spaces/)).toBeInTheDocument();
  expect(screen.getByText(/Uses more search index storage/)).toBeInTheDocument();

  fireEvent.click(toggle);

  expect(toggle).toHaveAttribute('aria-checked', 'true');
  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.fullTextSearchIndexStrategy)).toBe('cjk-trigram');
});
