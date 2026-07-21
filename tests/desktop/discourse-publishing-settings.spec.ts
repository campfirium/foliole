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
      project_name: 'playwright-site', site_address: 'https://notes.example.com'
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
  await expect(regions.foliole.getByRole('button', { name: /^(Publish to the web|发布到 Web)$/ })).toHaveAttribute('aria-expanded', 'false');
  await expect(regions.wordpress.getByRole('button', { exact: true, name: 'WordPress' })).toHaveAttribute('aria-expanded', 'false');
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
  const foliole = regions.foliole.getByRole('button', { name: /^(Publish to the web|发布到 Web)$/ });
  const wordpress = regions.wordpress.getByRole('button', { exact: true, name: 'WordPress' });
  const discourse = regions.discourse.getByRole('button', { name: 'Discourse' });
  const folioleBox = await foliole.boundingBox();
  expect(folioleBox?.width ?? 0).toBeGreaterThan(600);
  await foliole.click({ position: { x: (folioleBox?.width ?? 20) - 10, y: (folioleBox?.height ?? 20) / 2 } });
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
  const token = foliole.getByLabel(/^Cloudflare API Token$/);
  const subdomain = foliole.getByLabel(/^(pages.dev subdomain|pages.dev 子域名)$/);
  await expect(accountId).toBeVisible();
  await expect(token).toBeVisible();
  await expect(subdomain).toBeVisible();
  await expect(foliole.getByRole('button', { name: /^(API Token request page ↗|API Token 申请页面 ↗)$/ })).toBeVisible();
  await expect(foliole.getByRole('button', { name: /^(Deploy|部署)$/ })).toBeDisabled();
  await expect(foliole.getByRole('button', { name: /^(View local|查看本地)$/ })).toBeVisible();
  await expect(foliole.getByRole('button', { name: /^(View Web|查看 Web)$/ })).toBeDisabled();
  await foliole.getByText(/^(Static pages|静态页面)$/).scrollIntoViewIfNeeded();
  await expect(foliole.getByRole('button', { name: /^(Open|打开)$/ })).toBeVisible();
  await expect(foliole.getByRole('button', { name: /^(Reset|重置)$/ })).toBeVisible();
  const updateLocalPages = foliole.getByRole('button', { name: /^(Update local|更新本地)$/ });
  await expect(updateLocalPages).toBeVisible();
  await expect(foliole.getByRole('button', { name: /^(Update Web|更新 Web)$/ })).toBeDisabled();
  const previewScreenshot = await desktopWindow.screenshot();
  await writeFile(path.join(screenshotDir, 'foliole-publish-local-preview-hidden-native.png'), previewScreenshot);
  await testInfo.attach('foliole-publish-local-preview', { body: previewScreenshot, contentType: 'image/png' });
  await updateLocalPages.click();
  await expect(updateLocalPages).toBeEnabled();
  await expect(foliole.getByText(/^(Couldn't update the local pages\.|无法更新本地页面。)$/)).toHaveCount(0);
  await expect(foliole.getByText(/^(Custom domain \(optional\)|使用自定义域名（可选）)$/)).toBeVisible();
  await expect(foliole.getByText(/^(Security notice: Foliole does not operate or authorize foliole\.pages\.dev\.|安全提示：Foliole 未运营或授权 foliole\.pages\.dev。)$/)).toBeVisible();
  await accountId.evaluate((element) => element.scrollIntoView({ block: 'center' }));
  const credentialsScreenshot = await desktopWindow.screenshot({ fullPage: true });
  await writeFile(path.join(screenshotDir, 'foliole-publish-credentials-hidden-native.png'), credentialsScreenshot);
  await testInfo.attach('foliole-publish-credentials', { body: credentialsScreenshot, contentType: 'image/png' });

  await accountId.fill('playwright-account');
  await token.fill('PLAYWRIGHT-CLOUDFLARE-TOKEN');
  await expect(foliole.getByRole('button', { name: /^(Deploy|部署)$/ })).toBeDisabled();
  await subdomain.fill('playwright-site');
  await expect(foliole.getByRole('button', { name: /^(Deploy|部署)$/ })).toBeEnabled();
  await subdomain.evaluate((element) => element.scrollIntoView({ block: 'center' }));
  const siteScreenshot = await desktopWindow.screenshot({ fullPage: true });
  await writeFile(path.join(screenshotDir, 'foliole-publish-site-name-hidden-native.png'), siteScreenshot);
  await testInfo.attach('foliole-publish-site-name', { body: siteScreenshot, contentType: 'image/png' });
}

test('keeps independent Publish sections collapsed until opened and preserves their settings', async ({ desktopWindow }, testInfo) => {
  await seedDiscourseAuthorization(desktopWindow);
  const dialog = await openSettingsDialog(desktopWindow);
  await dialog.getByRole('button', { name: /^(Publish|发布)$/ }).click();

  await expect(dialog.getByRole('heading', { level: 2, name: /^(Publish|发布)$/ })).toBeVisible();
  const folioleRegion = dialog.getByRole('region', { name: /^(Publish to the web settings|发布到 Web 设置)$/ });
  const wordpressRegion = dialog.getByRole('region', { name: /^(WordPress publish settings|WordPress 发布设置)$/ });
  const discourseRegion = dialog.getByRole('region', { name: /^(Discourse publish settings|Discourse 发布设置)$/ });
  await expect(folioleRegion.getByRole('heading', { level: 3, name: /^(Publish to the web|发布到 Web)$/ })).toBeVisible();
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
  await expect(wordpressRegion.getByText(/^(Enter your WordPress address first\.|请先输入 WordPress 地址。)$/)).toBeVisible();
  await wordpressRegion.getByLabel(/^(WordPress site address|WordPress 站点地址)$/).fill('https://example.com');
  await expect(wordpressRegion.getByRole('button', { name: /Create an Application Password in this site’s WordPress user profile|在该站点的 WordPress 用户资料中创建 Application Password/ })).toBeVisible();
  await wordpressRegion.getByLabel(/^(WordPress site address|WordPress 站点地址)$/).fill('https://free-site.wordpress.com');
  await expect(wordpressRegion.getByRole('button', { name: /Create an Application Password in WordPress.com|在 WordPress.com 中创建 Application Password/ })).toBeVisible();
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
  await expect(discourseRegion.getByRole('button', { name: /^(Save|保存)$/ })).toHaveCount(0);
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

test('shows the connected public address and optional custom domain', async ({ desktopApp, desktopWindow }, testInfo) => {
  await seedConnectedFoliolePublish(desktopApp);
  const dialog = await openSettingsDialog(desktopWindow);
  await dialog.getByRole('button', { name: /^(Publish|发布)$/ }).click();
  const foliole = dialog.getByRole('region', { name: /^(Publish to the web settings|发布到 Web 设置)$/ });
  await foliole.getByRole('button', { name: /^(Publish to the web|发布到 Web)$/ }).click();
  const pagesAddress = foliole.getByText('https://playwright-site.pages.dev');
  await expect(pagesAddress).toBeVisible();
  await expect(foliole.getByLabel(/^(Foliole Publish custom domain|Foliole Publish 自定义域名)$/))
    .toHaveValue('https://notes.example.com');
  await expect(foliole.getByRole('button', { name: /^(Bind a domain in Cloudflare ↗|在 Cloudflare 中绑定域名 ↗)$/ })).toBeVisible();
  await pagesAddress.scrollIntoViewIfNeeded();

  const screenshot = await desktopWindow.screenshot({ fullPage: true });
  const screenshotDir = path.join(process.cwd(), '.tmp', 'artifacts');
  await mkdir(screenshotDir, { recursive: true });
  await writeFile(path.join(screenshotDir, 'foliole-publish-custom-domain-hidden-native.png'), screenshot);
  await testInfo.attach('foliole-publish-custom-domain', { body: screenshot, contentType: 'image/png' });
});
