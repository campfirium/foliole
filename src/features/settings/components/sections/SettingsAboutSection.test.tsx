import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

vi.mock('../../../../shared/platform/diagnosticBundle', () => ({
  copyDiagnosticReport: vi.fn()
}));

import type { NativeInvoke } from '../../../../../lib/platform/nativeContract';
import { APP_COMMAND_IDS } from '../../../../shared/commands/ids';
import { APP_SETTINGS_STORAGE_KEYS } from '../../../../shared/config/appSettings';
import { copyDiagnosticReport } from '../../../../shared/platform/diagnosticBundle';

import { SettingsAboutSection } from './SettingsAboutSection';

beforeEach(() => {
  vi.mocked(copyDiagnosticReport).mockReset();
  window.localStorage.clear();
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) }
  });
  const invoke = vi.fn(async (command: string) => {
    if (command === 'load_search_index_rebuild_status') return null;
    if (command === 'save_app_settings_state') return null;
    if (command === 'rebuild_search_index') {
      return { status: 'rebuilding', strategy: 'cjk-trigram' };
    }
    return null;
  }) as unknown as NativeInvoke;
  window.electronAPI = {
    invoke,
    onManagedInboxUpdated: () => () => undefined,
    onNativeMenuCommand: () => () => undefined,
    onSearchIndexRebuildStatus: () => () => undefined,
    onWindowResized: () => () => undefined
  };
});

it('shows application info and copies the diagnostic report in the about section', async () => {
  vi.mocked(copyDiagnosticReport).mockResolvedValue({
    reportText: '# Foliole Diagnostic Report',
    status: 'generated'
  });
  render(<SettingsAboutSection />);

  expect(screen.getByText('Version 0.60')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Check for Updates' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Copy diagnostic report' }));
  await waitFor(() => {
    expect(copyDiagnosticReport).toHaveBeenCalledTimes(1);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('# Foliole Diagnostic Report');
    expect(screen.getByText('Diagnostic report copied. It does not include your library content.')).toBeInTheDocument();
  });
  expect(screen.queryByText('/app/Backups')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Create backup' })).not.toBeInTheDocument();
});

it('runs update and community commands from General settings', () => {
  const onRunSupportCommand = vi.fn();
  render(<SettingsAboutSection onRunSupportCommand={onRunSupportCommand} />);

  fireEvent.click(screen.getByRole('button', { name: 'Check for Updates' }));
  fireEvent.click(screen.getByRole('button', { name: 'Feedback' }));

  expect(onRunSupportCommand).toHaveBeenNthCalledWith(1, APP_COMMAND_IDS.checkForUpdates);
  expect(onRunSupportCommand).toHaveBeenNthCalledWith(2, APP_COMMAND_IDS.openGitHubIssues);
});

it('shows the global search enhancement switch in General', async () => {
  render(<SettingsAboutSection />);

  const toggle = screen.getByRole('switch', { name: 'Search enhancement' });
  const versionTitle = screen.getByText('Version 0.60');
  const searchTitle = screen.getByText('Search');
  expect(toggle).toHaveAttribute('aria-checked', 'false');
  expect(versionTitle.compareDocumentPosition(searchTitle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(screen.getByText(/other languages that are not separated by spaces/)).toBeInTheDocument();
  expect(screen.getByText(/Uses more search data/)).toBeInTheDocument();

  fireEvent.click(toggle);

  await waitFor(() => {
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.fullTextSearchIndexStrategy)).toBe('cjk-trigram');
  });
  expect(screen.getByText('Preparing search...')).toBeInTheDocument();
});
