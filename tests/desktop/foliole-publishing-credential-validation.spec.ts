import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { expect, test } from './harness/fixtures';
import { openSettingsDialog } from './harness/settings';

test('flags malformed Cloudflare credentials before deployment', async ({ desktopWindow }, testInfo) => {
  const dialog = await openSettingsDialog(desktopWindow);
  await dialog.getByRole('button', { name: /^(Publish|发布)$/ }).click();
  const foliole = dialog.getByRole('region', { name: /^(Publish to the web settings|发布到 Web 设置)$/ });
  const section = foliole.getByRole('button', { name: /^(Publish to the web|发布到 Web)$/ });
  if (await section.getAttribute('aria-expanded') === 'false') await section.click();

  const accountId = foliole.getByLabel(/^Cloudflare Account ID$/);
  const apiToken = foliole.getByLabel(/^Cloudflare API Token$/);
  await foliole.getByLabel(/^(pages.dev subdomain|pages.dev 子域名)$/).fill('foliole');
  await accountId.fill('/');
  await apiToken.fill('/');

  await expect(accountId).toHaveAttribute('aria-invalid', 'true');
  await expect(apiToken).toHaveAttribute('aria-invalid', 'true');
  await expect(foliole.getByText(/^(Enter a 32-character Account ID|请输入 32 位 Account ID)/)).toBeVisible();
  await expect(foliole.getByText(/^(Enter the complete token from Cloudflare|请输入 Cloudflare 生成的完整令牌)/)).toBeVisible();
  await expect(foliole.getByRole('button', { name: /^(Deploy|部署)$/ })).toBeDisabled();

  const screenshot = await desktopWindow.screenshot({ fullPage: true });
  const screenshotPath = path.join(process.cwd(), '.tmp', 'artifacts', 'cloudflare-credential-validation-hidden-native.png');
  await mkdir(path.dirname(screenshotPath), { recursive: true });
  await writeFile(screenshotPath, screenshot);
  await testInfo.attach('cloudflare-credential-validation', { body: screenshot, contentType: 'image/png' });
});
