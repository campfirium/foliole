import { expect, test } from './harness/fixtures';
import { openSettingsCategory } from './harness/settings';

test('explains system Markdown associations and opens the system guide', async ({
  desktopApp, desktopWindow
}, testInfo) => {
  // SKIP: System association guidance covers macOS and Windows | 2026-11-25 | revive: Linux guidance is supported
  test.skip(process.platform !== 'darwin' && process.platform !== 'win32',
    'Markdown association guidance covers macOS and Windows');
  const settings = await openSettingsCategory(desktopWindow, 'General');
  const section = settings.getByRole('region', { name: /^(Markdown file associations|Markdown 文件关联)$/ });
  const isMac = process.platform === 'darwin';
  const instructions = isMac ? /Change All|全部更改/ : /Apps → Default apps|应用 → 默认应用/;
  await expect(section.getByText(instructions)).toBeVisible();
  await expect(section.getByRole('button', { name: /^(Open File|打开文件)…$/ })).toHaveCount(0);

  const screenshot = testInfo.outputPath('markdown-file-associations.png');
  await section.screenshot({ path: screenshot });
  await testInfo.attach('markdown-file-associations', { path: screenshot });

  await desktopApp.evaluate(({ shell }) => {
    const openedUrls: string[] = [];
    globalThis.__FOLIOLE_TEST_OPENED_EXTERNAL_URLS__ = openedUrls;
    shell.openExternal = async (url) => { openedUrls.push(url); };
  });
  await section.getByRole('button', { name: /^(System guide|系统操作指南)$/ }).click();
  const guideUrl = isMac
    ? 'https://support.apple.com/guide/mac-help/mh35597/mac'
    : 'https://support.microsoft.com/en-us/windows/apps/change-default-apps-in-windows';
  await expect.poll(() => desktopApp.evaluate(() => globalThis.__FOLIOLE_TEST_OPENED_EXTERNAL_URLS__))
    .toEqual([guideUrl]);
  await expect(section).toBeVisible();
});
