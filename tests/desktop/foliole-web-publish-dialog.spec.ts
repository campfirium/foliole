import fs from 'node:fs';
import path from 'node:path';

import type { ElectronApplication, Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';

const SCREENSHOT = path.resolve('.tmp/artifacts/desktop-acceptance/foliole-publish-official-theme.png');
const ARTICLE_SCREENSHOT = path.resolve('.tmp/artifacts/desktop-acceptance/foliole-publish-article.png');
const DIALOG_SCREENSHOT = path.resolve('.tmp/artifacts/desktop-acceptance/foliole-publish-dialog.png');
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
  seedPublishedTopics(libraryHome);
  const generated = await desktopWindow.evaluate(() => (
    globalThis.window?.electronAPI?.invoke('update_foliole_publish_local_pages') ?? null
  ));
  expect(generated).toMatchObject({ local_path: path.join(libraryHome, 'Publish', 'Site', 'index.html') });

  const site = await openStaticSite(desktopApp, generated.local_path);
  await expect(site.getByRole('heading', { level: 1, name: 'Topics' })).toBeVisible();
  await expect(site.locator('.topic-list > li')).toHaveCount(2);
  await expect(site.getByRole('navigation', { name: 'Site' }).getByRole('link', { name: 'RSS' }))
    .toHaveAttribute('href', /rss\.xml$/u);
  await expect(site.getByRole('link', { name: /A durable place to publish/u })).toBeVisible();
  await expect(site.getByRole('link', { name: /The earlier topic/u })).toBeVisible();
  await expect(site.locator('.keyboard-hint')).toHaveCount(0);
  await site.screenshot({ fullPage: true, path: SCREENSHOT });

  await site.getByRole('link', { name: /A durable place to publish/u }).click();
  await expect(site.getByRole('heading', { level: 1, name: 'A durable place to publish' })).toHaveCount(1);
  await expect(site.getByText('category')).toBeVisible();
  await expect(site.getByText('essays')).toBeVisible();
  await site.screenshot({ fullPage: true, path: ARTICLE_SCREENSHOT });
  await site.getByRole('link', { name: 'All topics' }).click();
  await expect(site.locator('.topic-list > li')).toHaveCount(2);

  await site.setViewportSize({ height: 844, width: 390 });
  await expect(site.locator('.site-header')).toBeVisible();
  expect(await site.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await site.emulateMedia({ colorScheme: 'dark' });
  expect(await site.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toContain('dark');
});
