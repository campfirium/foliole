import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';

import type { NativeInvoke } from '../../../../lib/platform/nativeContract';
import { APP_LANGUAGE_STORAGE_KEY } from '../../../shared/localization/appLanguage';
import { preloadTranslationCatalog } from '../../../shared/localization/translations';

import { defaultSettings } from './sections/SettingsBackupsSection.testUtils';
import { SettingsPanel } from './SettingsPanel';
import { createDeferred, createProps, renderWithMouseGestureProvider } from './SettingsPanel.testUtils';

const attachments = {
  automatic: false,
  observationThreshold: 30,
  usedBytes: 0,
  eligibleBytes: 0,
  trashBytes: 0,
  trash: []
};

beforeAll(() => preloadTranslationCatalog('zh-Hans'));
afterEach(() => vi.restoreAllMocks());

function openSettings(platform = 'MacIntel') {
  vi.spyOn(window.navigator, 'platform', 'get').mockReturnValue(platform);
  vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue(platform);
  window.localStorage.setItem(APP_LANGUAGE_STORAGE_KEY, 'zh-Hans');
  HTMLElement.prototype.scrollIntoView = vi.fn();
  const ready = createDeferred<void>();
  const responses: Record<string, unknown> = {
    load_backup_settings: defaultSettings,
    list_sqlite_backups: [],
    maintain_attachments: attachments,
    load_desktop_host_capabilities: {
      globalCaptureSupported: platform !== 'Linux x86_64',
      globalCapturePermission: 'granted',
      globalCaptureToastPositionSupported: platform === 'MacIntel'
    }
  };
  window.electronAPI = {
    invoke: vi.fn(async (command: string) => {
      await ready.promise;
      return responses[command] ?? null;
    }) as unknown as NativeInvoke,
    onManagedInboxUpdated: () => () => undefined,
    onNativeMenuCommand: () => () => undefined,
    onSearchIndexRebuildStatus: () => () => undefined,
    onWindowResized: () => () => undefined
  };
  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} requestedCategory="about" />);
  const input = screen.getByRole('textbox', { name: '搜索设置' });
  return {
    input,
    finishLoading: () => act(async () => ready.resolve()),
    search: (value: string) => fireEvent.change(input, { target: { value } })
  };
}

it.each([
  ['全局剪辑', '全局剪辑', '全局剪辑设置', 'heading', '全局剪辑'],
  ['全局捕捉', '全局剪辑', '全局剪辑设置', 'heading', '全局剪辑'],
  ['Markdown', '打开外部 Markdown', '打开外部 Markdown', 'button', '打开文件…'],
  ['文件权限', '打开外部 Markdown', '打开外部 Markdown', 'button', '打开文件…'],
  ['备份搜索', '搜索备份内容', '搜索备份设置区', 'button', '搜索备份内容'],
  ['搜索备份内容', '搜索备份内容', '搜索备份设置区', 'button', '搜索备份内容'],
  ['合并资料库', '并入资料库', '并入资料库设置区', 'button', '选择资料库'],
  ['并入资料库', '并入资料库', '并入资料库设置区', 'button', '选择资料库'],
  ['附件清理', '本机附件', '本机附件', 'switch', '自动清理'],
  ['本机附件', '本机附件', '本机附件', 'switch', '自动清理']
])('opens the applicable settings section for %s', async (query, title, region, role, control) => {
  const settings = openSettings();
  settings.search(query);
  expect(screen.getByRole('option', { selected: true })).toHaveTextContent(new RegExp(`^${title}`));
  fireEvent.keyDown(settings.input, { key: 'Enter' });
  await settings.finishLoading();

  const section = await screen.findByRole('region', { name: region });
  expect(within(section).getByRole(role, { name: control })).toBeVisible();
  await waitFor(() => {
    expect(section).toHaveClass('bg-[rgb(var(--role-accent-rgb)_/_0.12)]');
  });
});

it('indexes the capture section on Windows without the Mac-only confirmation position', async () => {
  const settings = openSettings('Win32');
  settings.search('完成提示位置');
  expect(screen.queryByRole('option')).toBeNull();
  settings.search('全局剪辑');
  fireEvent.keyDown(settings.input, { key: 'Enter' });
  await settings.finishLoading();
  const section = await screen.findByRole('region', { name: '全局剪辑设置' });
  expect(within(section).queryByRole('combobox', { name: '完成提示位置' })).toBeNull();
});

it('omits global capture search results on unsupported desktop platforms', async () => {
  const settings = openSettings('Linux x86_64');
  settings.search('全局剪辑');
  expect(screen.queryByRole('option', { name: /^全局剪辑/ })).toBeNull();
  await settings.finishLoading();
});

it.each([
  ['清理格式', '清理格式', /右上角.*菜单.*清理格式.*右键/],
  ['格式清理', '清理格式', /右上角.*菜单.*清理格式.*右键/],
  ['图片挖空', '图片挖空', /图片上拖出.*确认/],
  ['图像遮挡', '图片挖空', /图片上拖出.*确认/],
  ['公式挖空', '公式挖空', /渲染后.*公式上拖选/],
  ['数学挖空', '公式挖空', /渲染后.*公式上拖选/]
])('shows the editor action path for %s without leaving the current settings page', async (query, title, path) => {
  const settings = openSettings();
  await settings.finishLoading();
  settings.search(query);
  const tips = screen.getByRole('region', { name: '操作提示' });
  expect(within(tips).getByText(title, { exact: true })).toBeVisible();
  expect(within(tips).getByText(path)).toBeVisible();
  expect(screen.queryByText('没有找到设置。')).toBeNull();

  fireEvent.keyDown(settings.input, { key: 'Enter' });
  expect(tips).toBeVisible();
  expect(screen.getByRole('heading', { name: '关于' })).toBeVisible();

  fireEvent.keyDown(settings.input, { key: 'Escape' });
  expect(screen.queryByRole('region', { name: '操作提示' })).toBeNull();
});
