import path from 'node:path';

import { expect, test } from './harness/fixtures';

const SCREENSHOT_PATH = path.join(
  '.tmp',
  'artifacts',
  'desktop-acceptance',
  'wordpress-publish-loading-button-hidden-native.png'
);

test('keeps the WordPress publish button frame stable while publishing', async ({ desktopApp, desktopWindow }, testInfo) => {
  await desktopApp.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('foliole:invoke');
    ipcMain.handle('foliole:invoke', async (_event, request: { command?: string }) => {
      if (request.command === 'load_wordpress_publish_catalog') {
        await new Promise((resolve) => setTimeout(resolve, 1_200));
        return {
          categories: [{ id: 8, name: 'Product', parent_category_id: null, slug: 'product' }],
          selected_category_id: 8,
          selected_tags: [],
          tags: []
        };
      }
      if (request.command === 'publish_topic_to_wordpress') {
        await new Promise((resolve) => setTimeout(resolve, 2_000));
        return {
          mode: 'created',
          post_id: 'playwright-post',
          updated_content: '# Body title\n\nLong enough body for preview.',
          url: 'https://blog.example.com/playwright-post'
        };
      }
      if (request.command === 'update_node_content') return true;
      return null;
    });
  });
  await desktopWindow.evaluate(() => {
    window.dispatchEvent(new CustomEvent('foliole:wordpress-publish-dialog-request', {
      detail: {
        content: '# Body title\n\nLong enough body for preview.',
        nodeId: 'playwright-loading-button-topic',
        targetSiteUrl: 'https://blog.example.com',
        title: 'Loading button stability'
      }
    }));
  });

  const dialog = desktopWindow.getByRole('dialog', { name: /Publish to WordPress|发布到 WordPress/u });
  const catalogStatus = dialog.getByRole('status');
  await expect(catalogStatus).toContainText(/Loading categories and tags|正在加载分类和标签/u);
  await expect(catalogStatus).not.toContainText(/\.\.\.|…/u);
  await expect(catalogStatus.locator('.animate-spin')).toBeVisible();
  await expect(catalogStatus).toBeHidden();
  const categoryButton = dialog.getByRole('button', { name: /^(Category|分类)$/u });
  await expect(categoryButton).not.toContainText(/\.\.\.|…/u);
  await expect(categoryButton.locator('svg')).toBeVisible();
  const publishButton = dialog.getByRole('button', { name: /^(Publish|发布)$/u });
  await expect(publishButton).toBeVisible();
  const idleBox = await publishButton.boundingBox();

  await publishButton.click();
  await expect(publishButton).toHaveAttribute('aria-busy', 'true');
  await expect(publishButton).toBeDisabled();
  await expect(publishButton.locator('.animate-spin')).toBeVisible();
  const loadingBox = await publishButton.boundingBox();

  expect(loadingBox?.width).toBe(idleBox?.width);
  expect(loadingBox?.height).toBe(idleBox?.height);
  expect(loadingBox?.x).toBe(idleBox?.x);
  const screenshot = await dialog.screenshot({ path: SCREENSHOT_PATH });
  await testInfo.attach('wordpress-publish-loading-button', { body: screenshot, contentType: 'image/png' });
});
