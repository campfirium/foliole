import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

vi.mock('../../../../shared/platform/diagnosticBundle', () => ({
  copyDiagnosticReport: vi.fn()
}));

import type { NativeInvoke } from '../../../../../lib/platform/nativeContract';
import { APP_COMMAND_IDS } from '../../../../shared/commands/ids';
import { APP_SETTINGS_STORAGE_KEYS } from '../../../../shared/config/appSettings';
import { APP_LANGUAGE_STORAGE_KEY } from '../../../../shared/localization/appLanguage';
import { renderWithLocalization } from '../../../../shared/localization/testLocalization';
import { copyDiagnosticReport } from '../../../../shared/platform/diagnosticBundle';

import { SettingsAboutSection } from './SettingsAboutSection';
import { SettingsGeneralSection } from './SettingsGeneralSection';

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
  renderWithLocalization(<SettingsAboutSection />);

  expect(screen.getByText('Version 0.6.1')).toBeInTheDocument();
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

it('runs update and community commands from About settings', () => {
  const onRunSupportCommand = vi.fn();
  renderWithLocalization(<SettingsAboutSection onRunSupportCommand={onRunSupportCommand} />);

  fireEvent.click(screen.getByRole('button', { name: 'Check for Updates' }));
  fireEvent.click(screen.getByRole('button', { name: 'Issues' }));
  fireEvent.click(screen.getByRole('button', { name: 'YouTube' }));

  expect(screen.getByText('Checking')).toBeInTheDocument();
  expect(screen.getByText('Checking for updates...')).toBeInTheDocument();
  expect(onRunSupportCommand).toHaveBeenNthCalledWith(1, APP_COMMAND_IDS.checkForUpdates);
  expect(onRunSupportCommand).toHaveBeenNthCalledWith(2, APP_COMMAND_IDS.openGitHubIssues);
  expect(onRunSupportCommand).toHaveBeenNthCalledWith(3, APP_COMMAND_IDS.openYouTubePlaylist);
});

it('shows the latest available release in About settings', () => {
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.updateCheckState, JSON.stringify({
    cachedManifest: null,
    dismissedVersion: null,
    lastCheckedAt: '2026-05-31T00:00:00.000Z',
    lastCheckStatus: 'available',
    lastSeenVersion: '0.1.1',
    latestReleaseUrl: 'https://github.com/campfirium/foliole/releases/tag/v0.1.1',
    latestVersion: '0.1.1'
  }));

  renderWithLocalization(<SettingsAboutSection />);

  expect(screen.getByText('Update available')).toBeInTheDocument();
  expect(screen.getByText('Foliole 0.1.1 is available.')).toBeInTheDocument();
});

it('shows About sections in application, support, and community order', () => {
  renderWithLocalization(<SettingsAboutSection />);

  const appTitle = screen.getByRole('heading', { level: 3, name: 'App' });
  const supportTitle = screen.getByRole('heading', { level: 3, name: 'Support' });
  const communityTitle = screen.getByText('Community', { selector: 'h3' });
  expect(appTitle.compareDocumentPosition(supportTitle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(supportTitle.compareDocumentPosition(communityTitle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(screen.queryByRole('switch', { name: 'Search enhancement' })).not.toBeInTheDocument();
});

it('shows the global search enhancement switch in General', async () => {
  renderWithLocalization(<SettingsGeneralSection />);

  const toggle = screen.getByRole('switch', { name: 'Search enhancement' });
  expect(toggle).toHaveAttribute('aria-checked', 'false');
  expect(screen.getByText(/other languages that are not separated by spaces/)).toBeInTheDocument();
  expect(screen.getByText(/Uses more search data/)).toBeInTheDocument();

  fireEvent.click(toggle);

  await waitFor(() => {
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.fullTextSearchIndexStrategy)).toBe('cjk-trigram');
  });
  expect(screen.getByText('Preparing search...')).toBeInTheDocument();
});

it('localizes About and General settings rows in Simplified Chinese', () => {
  window.localStorage.setItem(APP_LANGUAGE_STORAGE_KEY, 'zh-Hans');

  renderWithLocalization(
    <>
      <SettingsAboutSection />
      <SettingsGeneralSection />
    </>
  );

  expect(screen.getByText('诊断报告')).toBeInTheDocument();
  expect(screen.getByText('打开源代码、社区讨论、反馈和视频更新入口。')).toBeInTheDocument();
  expect(screen.getByRole('switch', { name: '搜索增强' })).toBeInTheDocument();
  expect(screen.getByText('改进中文、日文、韩文以及其他不按空格分词语言的搜索，会使用更多搜索数据。')).toBeInTheDocument();
  expect(screen.queryByText('Diagnostic report')).not.toBeInTheDocument();
  expect(screen.queryByText('Community', { selector: 'h3' })).not.toBeInTheDocument();
  expect(screen.queryByRole('switch', { name: 'Search enhancement' })).not.toBeInTheDocument();
});
