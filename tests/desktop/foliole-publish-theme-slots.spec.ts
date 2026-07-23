import fs from 'node:fs';
import path from 'node:path';

import { expect, test } from './harness/fixtures';
import { openSettingsDialog } from './harness/settings';

const SCREENSHOT = path.resolve('.tmp/artifacts/desktop-acceptance/foliole-publish-theme-slots.png');

async function openThemeSettings(desktopWindow: Parameters<typeof openSettingsDialog>[0]) {
  const dialog = await openSettingsDialog(desktopWindow);
  await dialog.getByRole('button', { name: /^(Publish|发布)$/u }).click();
  const region = dialog.getByRole('region', { name: /^Publish to the site (settings|设置)$/u });
  const disclosure = region.getByRole('button', { name: 'Publish to the site' });
  if (await disclosure.getAttribute('aria-expanded') !== 'true') await disclosure.click();
  return { dialog, region };
}

test('shows Default and Custom as one persistent theme selector', async ({ desktopApp, desktopWindow }) => {
  await desktopWindow.evaluate(() => globalThis.window?.electronAPI?.invoke('load_foliole_publish_theme'));
  let settings = await openThemeSettings(desktopWindow);
  await expect(settings.region.getByText(/^(Set the publishing page theme\.|设置发布页面主题。)$/u)).toBeVisible();
  await expect(settings.region.getByRole('radio', { name: 'Default v4' })).toBeChecked();
  await expect(settings.region.getByRole('radio', { name: 'Custom v4' })).toBeVisible();
  await expect(settings.region.getByRole('button', { name: /^(Update local|更新本地)$/u })).toBeVisible();
  await expect(settings.region.getByRole('button', { name: /^(Update Web|更新 Web)$/u })).toBeVisible();
  fs.mkdirSync(path.dirname(SCREENSHOT), { recursive: true });
  await settings.dialog.screenshot({ path: SCREENSHOT });

  await desktopWindow.keyboard.press('Escape');
  await expect(settings.dialog).toBeHidden();
  const libraryHome = await desktopApp.evaluate(() => process.env.FOLIOLE_LIBRARY_HOME ?? null);
  if (!libraryHome) throw new Error('missing isolated library home');
  const publishRoot = path.join(libraryHome, 'Publish');
  const themeRoot = path.join(publishRoot, 'Theme');
  fs.mkdirSync(themeRoot, { recursive: true });
  for (const name of ['archive.html', 'page.html', 'site.js', 'style.css']) {
    fs.writeFileSync(path.join(themeRoot, name), `custom ${name}`);
  }
  fs.writeFileSync(path.join(publishRoot, '.foliole-theme.json'), `${JSON.stringify({
    active_theme: 'custom', custom_theme: { based_on_official_version: null },
    official_theme_version: 4, version: 2
  }, null, 2)}\n`);

  settings = await openThemeSettings(desktopWindow);
  await expect(settings.region.getByRole('radio', { name: 'Custom' })).toBeChecked();
  await expect(settings.region.getByRole('radio', { name: 'Custom v4' })).toHaveCount(0);
  await settings.region.getByRole('radio', { name: 'Default v4' }).click();
  await expect(settings.region.getByRole('radio', { name: 'Default v4' })).toBeChecked();
});
