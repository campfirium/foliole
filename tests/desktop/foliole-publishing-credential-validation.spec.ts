import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { expect, test } from './harness/fixtures';
import { openSettingsDialog } from './harness/settings';

const ACCOUNT_ID = '023e105f4ecef8ad9ca31a8372d0c353';
const API_TOKEN = 'Sn3lZJTBX6kkg7OdcBUAxOO963GEIyGQqnFTOFYY';

async function openFoliolePublishSettings(desktopWindow: Parameters<typeof openSettingsDialog>[0]) {
  const dialog = await openSettingsDialog(desktopWindow);
  await dialog.getByRole('button', { name: /^(Publish|发布)$/ }).click();
  const foliole = dialog.getByRole('region', { name: 'Publish to the site settings' });
  const section = foliole.getByRole('button', { name: 'Publish to the site' });
  if (await section.getAttribute('aria-expanded') === 'false') await section.click();
  return { dialog, foliole };
}

test('flags malformed Cloudflare credentials before deployment', async ({ desktopWindow }, testInfo) => {
  const { foliole } = await openFoliolePublishSettings(desktopWindow);

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

test('keeps an undeployed Publish draft after leaving and reopening settings', async ({ desktopWindow }, testInfo) => {
  const first = await openFoliolePublishSettings(desktopWindow);
  await first.foliole.getByLabel(/^Cloudflare API Token$/).fill(API_TOKEN);
  await first.foliole.getByLabel(/^Cloudflare Account ID$/).fill(ACCOUNT_ID);
  await first.foliole.getByLabel(/^(pages.dev subdomain|pages.dev 子域名)$/).fill('my-durable-site');
  await first.dialog.getByRole('button', { name: /^(General|通用)$/ }).click();

  await first.dialog.getByRole('button', { name: /^(Publish|发布)$/ }).click();
  const returned = first.dialog.getByRole('region', { name: 'Publish to the site settings' });
  const returnedSection = returned.getByRole('button', { name: 'Publish to the site' });
  if (await returnedSection.getAttribute('aria-expanded') === 'false') await returnedSection.click();
  await expect(returned.getByLabel(/^Cloudflare Account ID$/)).toHaveValue(ACCOUNT_ID);
  await expect(returned.getByLabel(/^(pages.dev subdomain|pages.dev 子域名)$/)).toHaveValue('my-durable-site');
  await expect(returned.getByLabel(/^Cloudflare API Token$/)).toHaveValue('••••••••••••');
  await expect(returned.getByRole('button', { name: /^(Deploy|部署)$/ })).toBeEnabled();
  await expect(returned.getByRole('button', { name: /^(Disconnect and delete site|断开并删除站点)$/ })).toHaveCount(0);

  await desktopWindow.keyboard.press('Escape');
  await expect(first.dialog).not.toBeVisible();
  const reopened = await openFoliolePublishSettings(desktopWindow);
  await expect(reopened.foliole.getByLabel(/^Cloudflare Account ID$/)).toHaveValue(ACCOUNT_ID);
  await expect(reopened.foliole.getByLabel(/^Cloudflare API Token$/)).toHaveValue('••••••••••••');
  const screenshot = await desktopWindow.screenshot({ fullPage: true });
  const screenshotPath = path.join(process.cwd(), '.tmp', 'artifacts', 'foliole-publish-draft-persistence-hidden-native.png');
  await mkdir(path.dirname(screenshotPath), { recursive: true });
  await writeFile(screenshotPath, screenshot);
  await testInfo.attach('foliole-publish-draft-persistence', { body: screenshot, contentType: 'image/png' });
});
