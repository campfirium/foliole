import { expect, test } from './harness/fixtures';
import { openSettingsCategory } from './harness/settings';

test('routes Markdown default app setup to the current platform', async ({
  desktopApp, desktopWindow
}, testInfo) => {
  const settings = await openSettingsCategory(desktopWindow, 'General');
  const section = settings.getByRole('region', { name: /^(External Markdown files|外部 Markdown 文件)$/ });
  const configure = section.getByRole('button', { name: /^(Set up|设置)$/ });
  await expect(section.getByRole('button')).toHaveCount(1);

  const screenshot = testInfo.outputPath('markdown-file-associations.png');
  await section.screenshot({ path: screenshot });
  await testInfo.attach('markdown-file-associations', { path: screenshot });

  if (process.platform === 'win32') {
    await desktopApp.evaluate(({ shell }) => {
      const openedUrls: string[] = [];
      globalThis.__FOLIOLE_TEST_OPENED_EXTERNAL_URLS__ = openedUrls;
      shell.openExternal = async (url) => { openedUrls.push(url); };
    });
    await configure.click();
    await expect.poll(() => desktopApp.evaluate(() => globalThis.__FOLIOLE_TEST_OPENED_EXTERNAL_URLS__))
      .toEqual(['ms-settings:defaultapps']);
    return;
  }

  const instructions = process.platform === 'darwin' ? /Change All|全部更改/ : /GNOME.*KDE Plasma/s;
  await expect(section.getByText(instructions)).toHaveCount(0);
  await configure.click();
  const guide = desktopWindow.getByRole('dialog', {
    name: /^(Set Foliole as the default app for Markdown files|将 Foliole 设为 Markdown 文件的默认应用)$/
  });
  await expect(guide.getByText(instructions)).toBeVisible();
  const guideScreenshot = testInfo.outputPath('markdown-association-guide.png');
  await guide.screenshot({ path: guideScreenshot });
  await testInfo.attach('markdown-association-guide', { path: guideScreenshot });
  await guide.getByRole('button', { name: /^(Close|关闭)$/ }).click();
  await expect(guide).toBeHidden();
  await expect(configure).toBeFocused();
});
