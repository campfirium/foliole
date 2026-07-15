import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell, openSettingsCategory } from './harness/settings';

const LOADING_FONTS = /^(Loading system fonts…|正在读取系统字体…)$/;
const TEXT_FONT = /^(Text font|正文字体)$/;
const MONOSPACE_FONT = /^(Monospace font preset|等宽字体预设)$/;

test('loads the system font catalog only after a font menu opens', async ({ desktopWindow }, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  const dialog = await openSettingsCategory(desktopWindow, 'Typography');
  const textFont = dialog.getByRole('combobox', { name: TEXT_FONT });
  const monospaceFont = dialog.getByRole('combobox', { name: MONOSPACE_FONT });

  await expect(textFont).toBeVisible();
  await expect(monospaceFont).toBeVisible();
  await expect(desktopWindow.getByText(LOADING_FONTS)).toHaveCount(0);

  await textFont.click();
  await expect(desktopWindow.getByText(LOADING_FONTS)).toBeVisible();
  const screenshotDir = path.join(process.cwd(), '.tmp', 'artifacts', 'desktop-acceptance');
  await mkdir(screenshotDir, { recursive: true });
  await desktopWindow.screenshot({
    path: path.join(screenshotDir, 'settings-font-catalog-lazy-loading.png')
  });

  await expect(desktopWindow.getByText(LOADING_FONTS)).toHaveCount(0, { timeout: 30_000 });
  if ((await textFont.getAttribute('aria-expanded')) !== 'true') {
    await textFont.click();
  }
  const options = desktopWindow.getByRole('option');
  await expect(options).not.toHaveCount(0);
  const searchableFont = await options.nth(Math.min(3, (await options.count()) - 1)).innerText();
  await desktopWindow.getByLabel(/^(Search fonts|搜索字体)$/).fill(searchableFont);
  const matchingOption = desktopWindow.getByRole('option', { name: searchableFont, exact: true });
  await expect(matchingOption).toBeVisible();
  await matchingOption.click();

  const titleSize = dialog.getByLabel(/^(Navigation title font size|导航标题字号)$/);
  await titleSize.fill('18');
  await expect.poll(() => desktopWindow.evaluate(() => document.documentElement.style.getPropertyValue('--navigation-title-font-size'))).toBe('18px');

  await dialog.getByRole('heading', { level: 3, name: /^(Reading|阅读)$/ }).click();
  await monospaceFont.click();
  await expect(desktopWindow.getByText(LOADING_FONTS)).toHaveCount(0);
  await desktopWindow.screenshot({
    path: path.join(screenshotDir, 'settings-typography-font-family-search.png')
  });
  await testInfo.attach('settings-font-catalog-loaded', {
    body: await desktopWindow.screenshot(),
    contentType: 'image/png'
  });
});
