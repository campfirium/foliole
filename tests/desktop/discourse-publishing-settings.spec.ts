import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { test, expect } from './harness/fixtures';
import { openSettingsDialog } from './harness/settings';

type RowLayout = {
  inputWidth: number;
  paragraphWidth: number;
  title: string;
};

type PublishingRegions = {
  discourse: import('@playwright/test').Locator;
  foliole: import('@playwright/test').Locator;
  wordpress: import('@playwright/test').Locator;
};

async function seedDiscourseAuthorization(desktopWindow: import('@playwright/test').Page) {
  await desktopWindow.evaluate(() => globalThis.window?.electronAPI?.invoke('save_discourse_publish_settings', {
    settings: { api_key: 'PLAYWRIGHT-DISCOURSE-USER-API-KEY', site_url: 'https://forum.example.com' }
  }));
}

async function seedConnectedFoliolePublish(desktopApp: import('@playwright/test').ElectronApplication) {
  await desktopApp.evaluate(async ({ app }) => {
    const { join } = process.getBuiltinModule('node:path');
    const { createRequire } = process.getBuiltinModule('node:module');
    const loadModule = createRequire(join(app.getAppPath(), 'main.js'));
    const { saveFoliolePublishConnection } = loadModule(join(
      app.getAppPath(), 'foliolePublish', 'foliolePublishSettings.js'
    ));
    saveFoliolePublishConnection({
      account_id: 'playwright-account', api_token: 'PLAYWRIGHT-CLOUDFLARE-TOKEN',
      project_name: 'playwright-site', site_address: 'https://notes.example.com', use_existing_project: false
    }, 'https://playwright-site.pages.dev');
  });
}

async function collectPublishingRowLayouts(dialog: import('@playwright/test').Locator): Promise<RowLayout[]> {
  return dialog.getByRole('region', {
    name: /^(Discourse publish settings|Discourse 发布设置)$/
  }).locator('[data-settings-row]').evaluateAll((rows) =>
    rows.map((row) => {
      const title = row.querySelector('h4')?.textContent?.trim() ?? '';
      const paragraph = row.querySelector('p');
      const input = row.querySelector('input');
      return {
        inputWidth: input?.getBoundingClientRect().width ?? 0,
        paragraphWidth: paragraph?.getBoundingClientRect().width ?? 0,
        title
      };
    })
  );
}

async function verifyCollapsedOverview(
  regions: PublishingRegions,
  desktopWindow: import('@playwright/test').Page,
  testInfo: import('@playwright/test').TestInfo
) {
  await expect(regions.foliole.getByRole('button', { name: 'Foliole Publish' })).toHaveAttribute('aria-expanded', 'false');
  await expect(regions.wordpress.getByRole('button', { name: 'WordPress' })).toHaveAttribute('aria-expanded', 'false');
  await expect(regions.discourse.getByRole('button', { name: 'Discourse' })).toHaveAttribute('aria-expanded', 'false');
  await expect(regions.foliole.getByLabel(/^Cloudflare Account ID$/)).not.toBeVisible();
  await expect(regions.wordpress.getByLabel(/^(WordPress site address|WordPress 站点地址)$/)).not.toBeVisible();
  await expect(regions.discourse.getByLabel(/^(Discourse forum URL|Discourse 论坛 URL)$/)).not.toBeVisible();

  const screenshot = await desktopWindow.screenshot({ fullPage: true });
  const screenshotDir = path.join(process.cwd(), '.tmp', 'artifacts');
  await mkdir(screenshotDir, { recursive: true });
  await writeFile(path.join(screenshotDir, 'publishing-settings-collapsed-hidden-native.png'), screenshot);
  await testInfo.attach('publishing-settings-collapsed', { body: screenshot, contentType: 'image/png' });
  return screenshotDir;
}

async function expandPublishingSections(regions: PublishingRegions) {
  const foliole = regions.foliole.getByRole('button', { name: 'Foliole Publish' });
  const wordpress = regions.wordpress.getByRole('button', { name: 'WordPress' });
  const discourse = regions.discourse.getByRole('button', { name: 'Discourse' });
  await foliole.click();
  await wordpress.click();
  await expect(foliole).toHaveAttribute('aria-expanded', 'true');
  await expect(wordpress).toHaveAttribute('aria-expanded', 'true');
  await expect(discourse).toHaveAttribute('aria-expanded', 'false');
  await discourse.click();
}

async function captureExpandedSettings(
  desktopWindow: import('@playwright/test').Page,
  screenshotDir: string,
  testInfo: import('@playwright/test').TestInfo
) {
  const screenshot = await desktopWindow.screenshot({ fullPage: true });
  await writeFile(path.join(screenshotDir, 'discourse-publishing-settings-hidden-native.png'), screenshot);
  await testInfo.attach('discourse-publishing-settings', { body: screenshot, contentType: 'image/png' });
}

async function verifyFolioleSetupSteps(
  foliole: import('@playwright/test').Locator,
  desktopWindow: import('@playwright/test').Page,
  screenshotDir: string,
  testInfo: import('@playwright/test').TestInfo
) {
  const accountId = foliole.getByLabel(/^Cloudflare Account ID$/);
  const token = foliole.getByLabel(/^(Cloudflare authorization result|Cloudflare 授权结果)$/);
  await expect(accountId).toBeVisible();
  await expect(token).toBeVisible();
  await expect(foliole.getByRole('button', { name: /^(Create access in Cloudflare|在 Cloudflare 创建授权)$/ })).toBeVisible();
  await expect(foliole.getByRole('button', { name: /^(Continue|继续)$/ })).toBeDisabled();
  await expect(foliole.getByLabel(/^(Free pages.dev site name|免费 pages.dev 站点名称)$/)).not.toBeVisible();
  await accountId.evaluate((element) => element.scrollIntoView({ block: 'center' }));
  const credentialsScreenshot = await desktopWindow.screenshot({ fullPage: true });
  await writeFile(path.join(screenshotDir, 'foliole-publish-credentials-hidden-native.png'), credentialsScreenshot);
  await testInfo.attach('foliole-publish-credentials', { body: credentialsScreenshot, contentType: 'image/png' });

  await accountId.fill('playwright-account');
  await token.fill('PLAYWRIGHT-CLOUDFLARE-TOKEN');
  await foliole.getByRole('button', { name: /^(Continue|继续)$/ }).click();
  const siteName = foliole.getByLabel(/^(Free pages.dev site name|免费 pages.dev 站点名称)$/);
  await expect(siteName).toBeVisible();
  await expect(accountId).not.toBeVisible();
  await expect(foliole.getByRole('button', { name: /^(Back|返回)$/ })).toBeVisible();
  await expect(foliole.getByRole('button', { name: /^(Preview|预览)$/ })).toBeVisible();
  await expect(foliole.getByRole('button', { name: /^(Create and publish|创建并发布)$/ })).toBeDisabled();
  await siteName.evaluate((element) => element.scrollIntoView({ block: 'center' }));
  const siteScreenshot = await desktopWindow.screenshot({ fullPage: true });
  await writeFile(path.join(screenshotDir, 'foliole-publish-site-name-hidden-native.png'), siteScreenshot);
  await testInfo.attach('foliole-publish-site-name', { body: siteScreenshot, contentType: 'image/png' });
}

test('keeps independent Publish sections collapsed until opened and preserves their settings', async ({ desktopWindow }, testInfo) => {
  await seedDiscourseAuthorization(desktopWindow);
  const dialog = await openSettingsDialog(desktopWindow);
  await dialog.getByRole('button', { name: /^(Publish|发布)$/ }).click();

  await expect(dialog.getByRole('heading', { level: 2, name: /^(Publish|发布)$/ })).toBeVisible();
  const folioleRegion = dialog.getByRole('region', { name: /^(Foliole Publish settings|Foliole Publish 设置)$/ });
  const wordpressRegion = dialog.getByRole('region', { name: /^(WordPress publish settings|WordPress 发布设置)$/ });
  const discourseRegion = dialog.getByRole('region', { name: /^(Discourse publish settings|Discourse 发布设置)$/ });
  await expect(folioleRegion.getByRole('heading', { level: 3, name: 'Foliole Publish' })).toBeVisible();
  await expect(wordpressRegion.getByRole('heading', { level: 3, name: 'WordPress' })).toBeVisible();
  await expect(discourseRegion.getByRole('heading', { level: 3, name: 'Discourse' })).toBeVisible();
  const regions = { discourse: discourseRegion, foliole: folioleRegion, wordpress: wordpressRegion };
  const screenshotDir = await verifyCollapsedOverview(regions, desktopWindow, testInfo);
  await expandPublishingSections(regions);
  const [folioleBox, wordpressBox, discourseBox] = await Promise.all([
    folioleRegion.boundingBox(), wordpressRegion.boundingBox(), discourseRegion.boundingBox()
  ]);
  expect(folioleBox?.y ?? 0).toBeLessThan(wordpressBox?.y ?? 0);
  expect(wordpressBox?.y ?? 0).toBeLessThan(discourseBox?.y ?? 0);
  await verifyFolioleSetupSteps(folioleRegion, desktopWindow, screenshotDir, testInfo);
  await expect(wordpressRegion.getByLabel(/^(WordPress site address|WordPress 站点地址)$/)).toBeVisible();
  await expect(wordpressRegion.getByLabel(/^(WordPress username|WordPress 用户名)$/)).toBeVisible();
  await expect(wordpressRegion.getByLabel(/^WordPress Application Password$/)).toBeVisible();
  await wordpressRegion.getByLabel(/^(WordPress site address|WordPress 站点地址)$/).fill('https://free-site.wordpress.com');
  await expect(wordpressRegion.getByText(/(account-level device credential|账户级设备凭据)/)).toBeVisible();
  await expect(wordpressRegion.getByLabel(/login password|登录密码/i)).toHaveCount(0);
  const forumUrl = dialog.getByRole('textbox', { name: /^(Discourse forum URL|Discourse 论坛 URL)$/ });
  await expect(forumUrl).toBeVisible();
  await expect(dialog.getByText(/forum must allow your account to generate User API Keys|论坛需允许当前账号生成 User API Key/)).toBeVisible();
  await expect(dialog.getByRole('button', { name: /^(Generate authorization link|生成授权链接)$/ })).toBeVisible();
  const authorizationResult = dialog.getByLabel(/^(Discourse authorization result|Discourse 授权结果)$/);
  await expect(authorizationResult).toBeVisible();
  await expect(dialog.getByRole('button', { name: /^(Save authorization|保存授权)$/ })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: /^(Test access|测试访问)$/ })).toBeVisible();
  await expect(dialog.getByRole('button', { name: /^(Remove authorization|移除授权)$/ })).toBeVisible();
  await expect(dialog.getByRole('button', { name: /^(Save|保存)$/ })).toHaveCount(0);
  await expect(dialog.getByText(/^(API username|API 用户名)$/)).toHaveCount(0);
  await expect(dialog.getByText(/^(Default category ID|默认分类 ID)$/)).toHaveCount(0);
  await expect(dialog.getByText(/^(Default tags|默认标签)$/)).toHaveCount(0);

  await forumUrl.fill('https://forum.example.com');

  const layouts = await collectPublishingRowLayouts(dialog);
  expect(layouts).toHaveLength(4);
  for (const layout of layouts.filter((row) => row.inputWidth > 0)) {
    expect(layout.paragraphWidth, `${layout.title} description should not collapse into a narrow column`).toBeGreaterThan(280);
    expect(layout.inputWidth, `${layout.title} input should keep a normal settings width`).toBeGreaterThan(320);
    expect(layout.inputWidth, `${layout.title} input should follow the 360px settings standard`).toBeLessThanOrEqual(360);
  }

  await discourseRegion.scrollIntoViewIfNeeded();
  await captureExpandedSettings(desktopWindow, screenshotDir, testInfo);
});

test('shows the connected pages.dev address and optional custom domain', async ({ desktopApp, desktopWindow }, testInfo) => {
  await seedConnectedFoliolePublish(desktopApp);
  const dialog = await openSettingsDialog(desktopWindow);
  await dialog.getByRole('button', { name: /^(Publish|发布)$/ }).click();
  const foliole = dialog.getByRole('region', { name: /^(Foliole Publish settings|Foliole Publish 设置)$/ });
  await foliole.getByRole('button', { name: 'Foliole Publish' }).click();
  await expect(foliole.getByText('https://playwright-site.pages.dev')).toBeVisible();
  await expect(foliole.getByLabel(/^(Foliole Publish custom domain|Foliole Publish 自定义域名)$/))
    .toHaveValue('https://notes.example.com');
  await expect(foliole.getByRole('button', { name: /^(Open setup guide|打开设置指引)$/ })).toBeVisible();

  const screenshot = await desktopWindow.screenshot({ fullPage: true });
  const screenshotDir = path.join(process.cwd(), '.tmp', 'artifacts');
  await mkdir(screenshotDir, { recursive: true });
  await writeFile(path.join(screenshotDir, 'foliole-publish-custom-domain-hidden-native.png'), screenshot);
  await testInfo.attach('foliole-publish-custom-domain', { body: screenshot, contentType: 'image/png' });
});
