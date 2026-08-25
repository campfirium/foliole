import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import {
  applyReadwiseRootPath,
  createDefaultImportManagerSettings
} from '../../lib/core/import/importManagerSettings';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell, openSettingsCategory } from './harness/settings';

const READWISE_ROOT = '/Users/example/Readwise/clip';
const ARTICLE_CONTENT_PATH = `${READWISE_ROOT}/Full Document Contents/Articles`;
const SCREENSHOT_PATH = path.join(
  process.cwd(),
  '.tmp/artifacts/desktop-acceptance/readwise-folder-tooltip.png'
);
const LAYOUT_SCREENSHOT_PATH = path.join(
  process.cwd(),
  '.tmp/artifacts/desktop-acceptance/readwise-folder-layout.png'
);

test('shows full paths consistently for Readwise folder buttons', async ({ desktopWindow }, testInfo) => {
  const settings = createDefaultImportManagerSettings();
  settings.readwiseRootPath = READWISE_ROOT;
  settings.readwiseSources = applyReadwiseRootPath(settings.readwiseSources, READWISE_ROOT);
  await desktopWindow.evaluate(async (nextSettings) => {
    await globalThis.window?.electronAPI?.invoke('save_import_manager_settings', { settings: nextSettings });
  }, settings);
  await desktopWindow.reload();

  await expectWorkspaceShell(desktopWindow);
  const dialog = await openSettingsCategory(desktopWindow, 'Readwise Reader');
  const tooltip = desktopWindow.getByRole('tooltip');
  const tooltipSurface = tooltip.locator('..');
  const rootButton = dialog.getByRole('button', { name: /^(Readwise root folder|Readwise 根文件夹)$/ });
  await desktopWindow.mouse.move(0, 0);
  await rootButton.hover();
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toHaveText(READWISE_ROOT);
  await expect(rootButton).not.toHaveAttribute('title');

  const articleButton = dialog.getByRole('button', { name: /^(Readwise original folder|Readwise 原始文件夹)/ }).first();
  await articleButton.hover();
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toHaveText(ARTICLE_CONTENT_PATH);
  await expect(articleButton).not.toHaveAttribute('title');

  await mkdir(path.dirname(SCREENSHOT_PATH), { recursive: true });
  const screenshot = await tooltipSurface.screenshot({ path: SCREENSHOT_PATH });
  await testInfo.attach('readwise-folder-tooltip', { body: screenshot, contentType: 'image/png' });
  await desktopWindow.mouse.move(0, 0);
  await expect(tooltip).not.toBeVisible();
  const layoutScreenshot = await dialog.screenshot({ path: LAYOUT_SCREENSHOT_PATH });
  await testInfo.attach('readwise-folder-layout', { body: layoutScreenshot, contentType: 'image/png' });
});
