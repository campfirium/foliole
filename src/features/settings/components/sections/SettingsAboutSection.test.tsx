import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

vi.mock('../../../../shared/platform/diagnosticBundle', () => ({
  copyDiagnosticReport: vi.fn()
}));

import { NATIVE_COMMANDS } from '../../../../../lib/platform/nativeCommands';
import type { NativeInvoke } from '../../../../../lib/platform/nativeContract';
import packageJson from '../../../../../package.json';
import { APP_SETTINGS_STORAGE_KEYS } from '../../../../shared/config/appSettings';
import { APP_LANGUAGE_STORAGE_KEY } from '../../../../shared/localization/appLanguage';
import { renderWithLocalization } from '../../../../shared/localization/testLocalization';
import { copyDiagnosticReport } from '../../../../shared/platform/diagnosticBundle';

import { SettingsAboutSection } from './SettingsAboutSection';
import { SettingsGeneralSection } from './SettingsGeneralSection';

const CURRENT_VERSION_TEXT = `Version ${packageJson.version}`;

beforeEach(() => {
  vi.mocked(copyDiagnosticReport).mockReset();
  window.localStorage.clear();
  window.localStorage.setItem(APP_LANGUAGE_STORAGE_KEY, 'en');
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

  expect(await screen.findByText(CURRENT_VERSION_TEXT)).toBeInTheDocument();
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

it('installs the packaged Foliole CLI from About settings', async () => {
  window.electronAPI!.invoke = vi.fn(async (command: string, args?: Record<string, unknown>) => {
    if (command !== NATIVE_COMMANDS.folioleCliInstall) return null;
    return args?.action === 'status'
      ? { commandPath: null, error: null, status: 'not_installed' }
      : { commandPath: '/opt/homebrew/bin/foliole', error: null, status: 'installed' };
  }) as unknown as NativeInvoke;

  renderWithLocalization(<SettingsAboutSection />);

  expect(await screen.findByText('Foliole CLI')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Install command' }));
  await waitFor(() => expect(screen.getByText('The foliole command is ready in Terminal.')).toBeInTheDocument());
  expect(window.electronAPI!.invoke).toHaveBeenCalledWith(
    NATIVE_COMMANDS.folioleCliInstall, { action: 'install' }
  );
});

it('shows the latest available release in About settings', async () => {
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.updateCheckState, JSON.stringify({
    cachedManifest: null,
    cachedReleaseNotes: null,
    dismissedVersion: null,
    lastCheckedAt: '2026-05-31T00:00:00.000Z',
    lastCheckStatus: 'available',
    lastSeenVersion: '0.1.1',
    latestReleaseUrl: 'https://github.com/campfirium/foliole/releases/tag/v0.1.1',
    latestVersion: '0.1.1'
  }));

  renderWithLocalization(<SettingsAboutSection />);

  expect(await screen.findByText('Update available')).toBeInTheDocument();
  expect(screen.getByText('Foliole 0.1.1 is available.')).toBeInTheDocument();
});

it('shows release notes for the available update in About settings', async () => {
  window.electronAPI!.invoke = vi.fn(async (command: string) =>
    command === NATIVE_COMMANDS.appGetVersion ? '0.6.1' : null
  ) as unknown as NativeInvoke;
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.updateCheckState, JSON.stringify({
    cachedManifest: {
      releases: [
        { date: '2026-06-01', platforms: ['windows'], url: 'https://github.com/campfirium/foliole/releases/tag/v0.6.2', version: '0.6.2' }
      ],
      schemaVersion: 1
    },
    cachedReleaseNotes: {
      en: {
        '0.6.2': {
          notes: [
            'Improved',
            'Initial Simplified Chinese interface support is now available.',
            'Inbox folder import now supports HTML files.',
            'Fixed',
            'About settings can now show the changes included in available updates.',
            'Reading material due dates now follow the learning day instead of a specific clock time.',
            'The Flow panel no longer shows material that is not due yet.'
          ]
        }
      },
      'zh-Hans': {
        '0.6.2': {
          notes: [
            '已加入初步的简体中文界面支持。',
            'Inbox 文件夹导入现在支持 HTML 格式。',
            '关于设置现在会显示可用更新包含的变化。',
            '阅读材料的到期时间现在按学习日计算，不再卡在具体时刻。',
            'Flow 面板中不再出现未到期的材料。'
          ]
        }
      }
    },
    dismissedVersion: null,
    lastCheckedAt: '2026-06-01T00:00:00.000Z',
    lastCheckStatus: 'available',
    lastSeenVersion: '0.6.2',
    latestReleaseUrl: 'https://github.com/campfirium/foliole/releases/tag/v0.6.2',
    latestVersion: '0.6.2'
  }));

  renderWithLocalization(<SettingsAboutSection />);

  await waitFor(() => expect(screen.getByRole('button', { name: 'View update details' })).toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: 'View update details' }));
  expect(screen.getByRole('dialog', { name: 'Update details' })).toBeInTheDocument();
  expect(screen.getByText('v0.6.2')).toBeInTheDocument();
  expect(screen.getByText('Improved').tagName).toBe('H4');
  expect(screen.getByText('Fixed').tagName).toBe('H4');
  expect(screen.getByText('Initial Simplified Chinese interface support is now available.')).toBeInTheDocument();
  expect(screen.getByText('About settings can now show the changes included in available updates.')).toBeInTheDocument();
  expect(screen.getByText('The Flow panel no longer shows material that is not due yet.')).toBeInTheDocument();
  expect(screen.queryByText('Review improvements.')).not.toBeInTheDocument();
});

it('shows release notes in Simplified Chinese', async () => {
  window.electronAPI!.invoke = vi.fn(async (command: string) =>
    command === NATIVE_COMMANDS.appGetVersion ? '0.6.1' : null
  ) as unknown as NativeInvoke;
  window.localStorage.setItem(APP_LANGUAGE_STORAGE_KEY, 'zh-Hans');
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.updateCheckState, JSON.stringify({
    cachedManifest: {
      releases: [
        { date: '2026-06-01', platforms: ['windows'], url: 'https://github.com/campfirium/foliole/releases/tag/v0.6.2', version: '0.6.2' }
      ],
      schemaVersion: 1
    },
    cachedReleaseNotes: {
      en: {
        '0.6.2': { notes: ['Initial Simplified Chinese interface support is now available.'] }
      },
      'zh-Hans': {
        '0.6.2': {
          notes: [
            '已加入初步的简体中文界面支持。',
            '关于设置现在会显示可用更新包含的变化。'
          ]
        }
      }
    },
    dismissedVersion: null,
    lastCheckedAt: '2026-06-01T00:00:00.000Z',
    lastCheckStatus: 'available',
    lastSeenVersion: '0.6.2',
    latestReleaseUrl: 'https://github.com/campfirium/foliole/releases/tag/v0.6.2',
    latestVersion: '0.6.2'
  }));

  renderWithLocalization(<SettingsAboutSection />);

  await waitFor(() => expect(screen.getByRole('button', { name: '查看更新内容' })).toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: '查看更新内容' }));
  expect(screen.getByRole('dialog', { name: '更新内容' })).toBeInTheDocument();
  expect(screen.getByText('v0.6.2')).toBeInTheDocument();
  expect(screen.getByText('已加入初步的简体中文界面支持。')).toBeInTheDocument();
  expect(screen.getByText('关于设置现在会显示可用更新包含的变化。')).toBeInTheDocument();
  expect(screen.queryByText('Initial Simplified Chinese interface support is now available.')).not.toBeInTheDocument();
});

it('shows About sections in application, support, and community order', () => {
  renderWithLocalization(<SettingsAboutSection />);

  const appTitle = screen.getByRole('heading', { level: 3, name: 'App' });
  const supportTitle = screen.getByRole('heading', { level: 3, name: 'Support' });
  const communityTitle = screen.getByText('Community', { selector: 'h3' });
  expect(appTitle.compareDocumentPosition(supportTitle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(supportTitle.compareDocumentPosition(communityTitle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(screen.queryByRole('combobox', { name: 'Full-text search language' })).not.toBeInTheDocument();
});

it('shows the full-text search language selector in General', async () => {
  renderWithLocalization(<SettingsGeneralSection />);

  const select = screen.getByRole('combobox', { name: 'Full-text search language' });
  expect(select).toHaveValue('word-based');
  expect(screen.getByText(/Chinese, Japanese, or Korean uses more search data/)).toBeInTheDocument();

  fireEvent.change(select, { target: { value: 'cjk-trigram' } });

  await waitFor(() => {
    expect(select).toHaveValue('cjk-trigram');
    expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.fullTextSearchIndexStrategy)).toBe('cjk-trigram');
  });
  expect(screen.getByText('Preparing search data...')).toBeInTheDocument();
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
  expect(screen.getByText('发送私下反馈，可选择留下联系方式和图片；也可以通过邮件继续沟通。')).toBeInTheDocument();
  expect(screen.getByText('项目与社区入口。')).toBeInTheDocument();
  expect(screen.getByRole('combobox', { name: '全文搜索语言' })).toBeInTheDocument();
  expect(screen.getByText('选择 Foliole 如何准备全文搜索。中文、日文或韩文会使用更多搜索数据。')).toBeInTheDocument();
  expect(screen.queryByText('Diagnostic report')).not.toBeInTheDocument();
  expect(screen.queryByText('Community', { selector: 'h3' })).not.toBeInTheDocument();
  expect(screen.queryByRole('combobox', { name: 'Full-text search language' })).not.toBeInTheDocument();
});
