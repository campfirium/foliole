import path from 'node:path';

import { expect, test } from './harness/fixtures';

const wordpressCatalog = {
  categories: [
    { id: 7, name: 'Writing', parent_category_id: null, slug: 'writing' },
    { id: 8, name: 'Product', parent_category_id: null, slug: 'product' },
    { id: 9, name: 'Engineering', parent_category_id: null, slug: 'engineering' }
  ],
  fetched_at: '2026-07-24T00:00:00.000Z',
  from_cache: false,
  selected_category_id: 8,
  selected_tags: ['foliole'],
  tags: [
    { id: 11, name: 'foliole', slug: 'foliole' },
    { id: 12, name: 'reading', slug: 'reading' },
    { id: 13, name: 'local-first', slug: 'local-first' }
  ]
};

test('opens from cached WordPress taxonomy before the background refresh completes', async ({ desktopApp, desktopWindow }, testInfo) => {
  await desktopApp.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('foliole:invoke');
    ipcMain.handle('foliole:invoke', async (_event, request: { args?: { refresh?: boolean }; command?: string }) => {
      if (request.command !== 'load_wordpress_publish_catalog') return null;
      if (request.args?.refresh) {
        await new Promise((resolve) => setTimeout(resolve, 800));
        return {
          categories: [{ id: 9, name: 'Fresh Engineering', parent_category_id: null, slug: 'fresh-engineering' }],
          fetched_at: '2026-07-24T00:01:00.000Z',
          from_cache: false,
          selected_category_id: 9,
          selected_tags: ['fresh-tag'],
          tags: [{ id: 19, name: 'fresh-tag', slug: 'fresh-tag' }]
        };
      }
      return {
        categories: [{ id: 8, name: 'Cached Product', parent_category_id: null, slug: 'cached-product' }],
        fetched_at: '2026-07-24T00:00:00.000Z',
        from_cache: true,
        selected_category_id: 8,
        selected_tags: ['cached-tag'],
        tags: [{ id: 18, name: 'cached-tag', slug: 'cached-tag' }]
      };
    });
  });
  await desktopWindow.evaluate(() => {
    window.dispatchEvent(new CustomEvent('foliole:wordpress-publish-dialog-request', {
      detail: {
        content: '# Cached-first title\n\nLong enough body for preview.',
        nodeId: 'playwright-wordpress-cached-topic',
        targetSiteUrl: 'https://blog.example.com',
        title: 'Cached-first title'
      }
    }));
  });

  const dialog = desktopWindow.getByRole('dialog', { name: /Publish to WordPress|发布到 WordPress/u });
  const category = dialog.getByRole('button', { name: /^(Category|分类)$/u });
  await expect(category).toContainText('Cached Product');
  await expect(dialog.getByRole('status')).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: /^(Publish|发布)$/u })).toBeEnabled();
  const screenshot = await dialog.screenshot({
    path: path.join('.tmp', 'artifacts', 'desktop-acceptance', 'wordpress-publish-cache-first-hidden-native.png')
  });
  await testInfo.attach('wordpress-publish-cache-first', { body: screenshot, contentType: 'image/png' });
  await expect(category).toContainText('Fresh Engineering');
});

test('shows WordPress taxonomy choices in the shared publish panel', async ({ desktopWindow }, testInfo) => {
  await desktopWindow.evaluate((catalog) => {
    window.dispatchEvent(new CustomEvent('foliole:wordpress-publish-dialog-request', {
      detail: {
        catalog,
        content: '# Body title\n\nLong enough body for preview.',
        nodeId: 'playwright-wordpress-topic',
        targetSiteUrl: 'https://blog.example.com',
        title: 'Folder title'
      }
    }));
  }, wordpressCatalog);

  const dialog = desktopWindow.getByRole('dialog', { name: 'Publish to WordPress' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel(/^(Post status|文章状态)$/)).toHaveValue('publish');
  await expect(dialog.getByLabel(/^(Category|分类)$/).first()).toContainText('Product');
  await expect(dialog.getByLabel(/^(Tags|标签)$/).first().locator('..').getByText('foliole')).toBeVisible();
  await expect(dialog.getByText('https://blog.example.com')).toHaveCount(0);
  await expect(dialog.getByText(/Create a new post|创建新文章/u)).toHaveCount(0);

  await dialog.getByLabel(/^(Category|分类)$/).first().click();
  await dialog.getByRole('textbox', { name: /^(Category|分类)$/ }).fill('Research');
  await dialog.getByRole('option', { name: /^(Create “Research”|新建“Research”)$/ }).click();
  await expect(dialog.getByLabel(/^(Category|分类)$/).first()).toContainText('Research');

  const screenshot = await desktopWindow.screenshot({
    path: path.join('.tmp', 'artifacts', 'desktop-acceptance', 'wordpress-publish-taxonomy-hidden-native.png')
  });
  await testInfo.attach('wordpress-publish-taxonomy', { body: screenshot, contentType: 'image/png' });
});
