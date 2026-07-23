import path from 'node:path';

import { expect, test } from './harness/fixtures';

const wordpressCatalog = {
  categories: [
    { id: 7, name: 'Writing', parent_category_id: null, slug: 'writing' },
    { id: 8, name: 'Product', parent_category_id: null, slug: 'product' },
    { id: 9, name: 'Engineering', parent_category_id: null, slug: 'engineering' }
  ],
  selected_category_id: 8,
  selected_tags: ['foliole'],
  tags: [
    { id: 11, name: 'foliole', slug: 'foliole' },
    { id: 12, name: 'reading', slug: 'reading' },
    { id: 13, name: 'local-first', slug: 'local-first' }
  ]
};

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
