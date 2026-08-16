import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell, openSettingsDialog } from './harness/settings';

const SCREENSHOT_PATH = path.resolve(
  '.tmp/artifacts/settings-editor-frontmatter-copy-hidden-native.png'
);
const DESCRIPTION = '自定义正文元信息栏中直接显示的字段；其余 YAML 元信息可通过栏内的 meta 按钮展开查看。';

test('shows the confirmed document metadata description in Editor settings', async ({
  desktopWindow
}, testInfo) => {
  await desktopWindow.evaluate(() => {
    window.localStorage.setItem('foliole-app-language', 'zh-Hans');
  });
  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);

  const dialog = await openSettingsDialog(desktopWindow);
  await dialog.getByRole('button', { exact: true, name: '编辑器' }).click();
  await expect(dialog.getByRole('heading', { exact: true, level: 2, name: '编辑器' })).toBeVisible();

  const title = dialog.getByText('文档元信息', { exact: true });
  await expect(title).toBeVisible();
  await expect(dialog.getByText(DESCRIPTION, { exact: true })).toBeVisible();

  await mkdir(path.dirname(SCREENSHOT_PATH), { recursive: true });
  const screenshot = await dialog.screenshot({ path: SCREENSHOT_PATH });
  await testInfo.attach('settings-editor-frontmatter-copy', {
    body: screenshot,
    contentType: 'image/png'
  });
});
