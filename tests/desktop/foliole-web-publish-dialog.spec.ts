import fs from 'node:fs';
import path from 'node:path';

import type { ElectronApplication, Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';

const SCREENSHOT = path.resolve('.tmp/artifacts/desktop-acceptance/foliole-publish-official-theme.png');
const ARTICLE_SCREENSHOT = path.resolve('.tmp/artifacts/desktop-acceptance/foliole-publish-article.png');
const ARCHIVE_SCREENSHOT = path.resolve('.tmp/artifacts/desktop-acceptance/foliole-publish-archive.png');
const SEARCH_SCREENSHOT = path.resolve('.tmp/artifacts/desktop-acceptance/foliole-publish-search.png');
const MOBILE_SCREENSHOT = path.resolve('.tmp/artifacts/desktop-acceptance/foliole-publish-article-mobile.png');
const DIALOG_SCREENSHOT = path.resolve('.tmp/artifacts/desktop-acceptance/foliole-publish-dialog.png');
const EMPTY_SCREENSHOT = path.resolve('.tmp/artifacts/desktop-acceptance/foliole-publish-empty-site.png');
const NEWER_ID = 'playwright-newer-topic';
const OLDER_ID = 'playwright-older-topic';

async function openStaticSite(desktopApp: ElectronApplication, entry: string) {
  await desktopApp.evaluate(async ({ BrowserWindow }, file) => {
    const preview = new BrowserWindow({
      height: 900,
      show: false,
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
      width: 1280
    });
    await preview.loadFile(file);
  }, entry);
  await expect.poll(async () => {
    for (const page of desktopApp.windows()) {
      if (await page.locator('[data-foliole-publish-site]').count()) return true;
    }
    return false;
  }).toBe(true);
  const pages = await Promise.all(desktopApp.windows().map(async (page) => ({
    isPublishSite: await page.locator('[data-foliole-publish-site]').count(), page
  })));
  const match = pages.find((entryPage) => entryPage.isPublishSite)?.page;
  if (!match) throw new Error('generated Foliole Publish page did not open');
  return match;
}

function publishedMarkdown() {
  return `---
foliole:
  publish:
    schemaVersion: 1
    web:
      pageId: ${NEWER_ID}
      site: https://notes.example.com
      url: https://notes.example.com/cards/${NEWER_ID}.html
      fields:
        category: essays
        tags:
          - design
          - reading
      lastPublishedAt: "2026-07-21T09:30:00.000Z"
---
# A durable place to publish

## A calmer reading surface

The official theme keeps long-form reading clear on every screen.

> Published Topics stay yours.`;
}

function seedPublishedTopics(libraryHome: string) {
  const publishRoot = path.join(libraryHome, 'Publish');
  const contentRoot = path.join(publishRoot, 'Content');
  fs.mkdirSync(contentRoot, { recursive: true });
  fs.writeFileSync(path.join(contentRoot, `${NEWER_ID}.md`), publishedMarkdown());
  fs.writeFileSync(path.join(contentRoot, `${OLDER_ID}.md`), 'An older published Topic.');
  fs.writeFileSync(path.join(publishRoot, 'publish.yaml'), `${JSON.stringify({
    cards: [
      { file: `Content/${NEWER_ID}.md`, id: NEWER_ID, published_at: '2026-07-21T09:00:00.000Z', title: 'A durable place to publish', updated_at: '2026-07-21T09:30:00.000Z' },
      { file: `Content/${OLDER_ID}.md`, id: OLDER_ID, published_at: '2026-07-20T09:00:00.000Z', title: 'The earlier topic', updated_at: '2026-07-20T09:00:00.000Z' }
    ],
    site: { title: 'Foliole Field Notes' },
    version: 1
  }, null, 2)}\n`);
}

async function openPublishDialog(desktopWindow: Page) {
  await desktopWindow.evaluate(() => {
    window.dispatchEvent(new CustomEvent('foliole:web-publish-dialog-request', { detail: {
      content: '# Local preview', nodeId: 'playwright-web-publish-topic',
      settings: { account_id: '', field_catalog: [], has_credentials: false, pages_url: '', project_name: '', site_address: '', updated_at: null },
      title: 'Local preview'
    } }));
  });
  return desktopWindow.getByRole('dialog', { name: 'Publish to the site' });
}

async function verifyHomeAndArticle(site: Page) {
  await expect(site.getByRole('heading', { level: 1, name: 'Foliole Field Notes' })).toBeVisible();
  await expect(site.locator('.topic-card')).toHaveCount(2);
  await expect(site.locator('.page-header .global-nav')).toBeVisible();
  await expect(site.getByRole('navigation', { name: 'Site navigation' }).getByRole('link', { name: 'RSS feed' }))
    .toHaveAttribute('href', /rss\.xml$/u);
  await expect(site.getByRole('link', { name: /The earlier topic/u })).toBeVisible();
  await site.screenshot({ fullPage: true, path: SCREENSHOT });
  await site.getByRole('link', { exact: true, name: 'A durable place to publish' }).click();
  await expect(site.getByRole('heading', { level: 1, name: 'A durable place to publish' })).toHaveCount(1);
  await expect(site.getByRole('heading', { level: 2, name: 'A durable place to publish' })).toHaveCount(0);
  await expect(site.getByText('Category')).toBeVisible();
  await expect(site.getByText('essays')).toBeVisible();
  await expect(site.getByText('Updated')).toBeVisible();
  await expect(site.locator('.article-footer .global-nav')).toBeVisible();
  await expect(site.locator('.page-header')).toHaveCount(0);
  await site.screenshot({ fullPage: true, path: ARTICLE_SCREENSHOT });
}

async function verifyArchiveAndTaxonomy(site: Page) {
  await site.getByRole('link', { name: 'Archive' }).click();
  await expect(site.getByRole('heading', { level: 1, name: 'Archive' })).toBeVisible();
  await expect(site.locator('.page-header .global-nav')).toBeVisible();
  await expect(site.locator('.index-row')).toHaveCount(2);
  await site.screenshot({ fullPage: true, path: ARCHIVE_SCREENSHOT });
  await site.getByRole('link', { name: 'Categories' }).click();
  await expect(site.getByRole('heading', { level: 1, name: 'Categories' })).toBeVisible();
  await site.getByRole('link', { name: 'essays' }).click();
  await expect(site.getByRole('heading', { level: 1, name: 'essays' })).toBeVisible();
  await expect(site.locator('.index-row')).toHaveCount(1);
  await site.getByRole('link', { name: 'Tags' }).click();
  await expect(site.getByRole('heading', { level: 1, name: 'Tags' })).toBeVisible();
  await site.getByRole('link', { name: '#design' }).click();
  await expect(site.getByRole('heading', { level: 1, name: 'design' })).toBeVisible();
}

async function verifySearchAndMobile(site: Page) {
  await site.getByRole('link', { name: 'Search' }).click();
  const search = site.getByRole('searchbox', { name: 'Search published topics' });
  await search.fill('calmer reading');
  await expect(site.getByRole('link', { name: 'A durable place to publish' })).toBeVisible();
  await search.fill('no-such-topic');
  await expect(site.getByText('No topics found.')).toBeVisible();
  await site.screenshot({ fullPage: true, path: SEARCH_SCREENSHOT });
  await site.getByRole('link', { name: 'Home' }).click();
  await site.getByRole('link', { exact: true, name: 'A durable place to publish' }).click();
  await site.setViewportSize({ height: 844, width: 390 });
  expect(await site.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await site.screenshot({ fullPage: true, path: MOBILE_SCREENSHOT });
  await site.emulateMedia({ colorScheme: 'dark' });
  expect(await site.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toContain('light');
}

test('keeps Theme controls out of Publish and renders the generated static site in a real browser window', async ({ desktopApp, desktopWindow }) => {
  const dialog = await openPublishDialog(desktopWindow);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/^(Fields|字段)$/u)).toBeVisible();
  await expect(dialog.getByRole('button', { name: /^(Open theme|打开主题)$/u })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: /^(Reset theme|重置主题)$/u })).toHaveCount(0);
  await dialog.screenshot({ path: DIALOG_SCREENSHOT });

  const libraryHome = await desktopApp.evaluate(() => process.env.FOLIOLE_LIBRARY_HOME ?? null);
  if (!libraryHome) throw new Error('missing isolated library home');
  await desktopWindow.evaluate(() => globalThis.window?.electronAPI?.invoke('reset_foliole_publish_theme'));
  await desktopWindow.evaluate(() => globalThis.window?.electronAPI?.invoke(
    'save_foliole_publish_site_title', { site_title: 'Working Memory' }
  ));
  const emptyGenerated = await desktopWindow.evaluate(() => (
    globalThis.window?.electronAPI?.invoke('update_foliole_publish_local_pages') ?? null
  ));
  const emptySite = await openStaticSite(desktopApp, emptyGenerated.local_path);
  await expect(emptySite.locator('.empty-publish-state')).toBeVisible();
  await expect(emptySite.locator('[data-empty-publish-word]')).toHaveText('Reading...');
  await expect(emptySite.locator('.empty-home-nav')).toHaveText('Home Archive Categories Tags Search');
  await expect(emptySite.locator('.empty-home-nav').getByText('RSS')).toHaveCount(0);
  await expect(emptySite.locator('head link[rel="alternate"][type="application/rss+xml"]')).toHaveCount(1);
  await emptySite.screenshot({ fullPage: true, path: EMPTY_SCREENSHOT });
  await emptySite.close();
  seedPublishedTopics(libraryHome);
  const generated = await desktopWindow.evaluate(() => (
    globalThis.window?.electronAPI?.invoke('update_foliole_publish_local_pages') ?? null
  ));
  expect(generated).toMatchObject({ local_path: path.join(libraryHome, 'Publish', 'Site', 'index.html') });

  const site = await openStaticSite(desktopApp, generated.local_path);
  const browserErrors: string[] = [];
  site.on('console', (message) => { if (message.type() === 'error') browserErrors.push(message.text()); });
  await expect(site.locator('.keyboard-hint')).toHaveCount(0);
  await verifyHomeAndArticle(site);
  await verifyArchiveAndTaxonomy(site);
  await verifySearchAndMobile(site);
  expect(browserErrors).toEqual([]);
});
