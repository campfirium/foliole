import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { expect, test } from './harness/fixtures';
import { openSettingsDialog } from './harness/settings';

async function openWordPressSettings(desktopWindow: import('@playwright/test').Page) {
  const dialog = await openSettingsDialog(desktopWindow);
  await dialog.getByRole('button', { name: /^(Publish|发布)$/ }).click();
  const region = dialog.getByRole('region', {
    name: /^(WordPress publish settings|WordPress 发布设置)$/
  });
  const section = region.getByRole('button', { name: 'Publish to WordPress' });
  if (await section.getAttribute('aria-expanded') === 'false') await section.click();
  return region;
}

test('shows the original WordPress connection error', async ({ desktopApp, desktopWindow }, testInfo) => {
  await desktopApp.evaluate(() => {
    const target = globalThis as typeof globalThis & { __wordpressConnectionOriginalFetch?: typeof fetch };
    target.__wordpressConnectionOriginalFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      if (String(input).includes('example.com/wp-json/wp/v2/users/me')) {
        return new Response(JSON.stringify({ code: 'incorrect_password' }), { status: 401 });
      }
      return target.__wordpressConnectionOriginalFetch!(input, init);
    };
  });

  try {
    const region = await openWordPressSettings(desktopWindow);
    await region.getByLabel(/^(WordPress site address|WordPress 站点地址)$/).fill('https://example.com');
    await region.getByLabel(/^(WordPress username|WordPress 用户名)$/).fill('writer');
    await region.getByLabel(/^WordPress Application Password$/).fill('invalid-password');
    await region.getByRole('button', { name: /^(Connect|连接)$/ }).click();

    await expect(region.getByText('WordPress Application Password authentication failed (401)')).toBeVisible();
    await expect(region.getByText(/^(Connection successful\.|连接成功。)$/)).toHaveCount(0);
    await expect(region.getByLabel(/^(WordPress site address|WordPress 站点地址)$/)).toBeEnabled();

    const screenshot = await desktopWindow.screenshot({ fullPage: true });
    const screenshotPath = path.join(process.cwd(), '.tmp', 'artifacts', 'wordpress-connection-error-hidden-native.png');
    await mkdir(path.dirname(screenshotPath), { recursive: true });
    await writeFile(screenshotPath, screenshot);
    await testInfo.attach('wordpress-connection-error', { body: screenshot, contentType: 'image/png' });
  } finally {
    await desktopApp.evaluate(() => {
      const target = globalThis as typeof globalThis & { __wordpressConnectionOriginalFetch?: typeof fetch };
      if (target.__wordpressConnectionOriginalFetch) globalThis.fetch = target.__wordpressConnectionOriginalFetch;
      delete target.__wordpressConnectionOriginalFetch;
    });
  }
});
