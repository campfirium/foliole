import path from 'node:path';

import { expect, test } from './harness/fixtures';

const SCREENSHOT_PATH = path.join(
  '.tmp',
  'artifacts',
  'desktop-acceptance',
  'wordpress-publish-loading-button-fluid-width-hidden-native.png'
);

test('lets the WordPress publish button grow with its active label', async ({ desktopApp, desktopWindow }, testInfo) => {
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
        title: 'Loading button active width'
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
  const publishingButton = dialog.getByRole('button', { name: /^(Publishing\.\.\.|正在发布\.\.\.)$/u });
  await expect(publishingButton).toHaveAttribute('aria-busy', 'true');
  await expect(publishingButton).toBeDisabled();
  await expect(publishingButton.locator('.animate-spin')).toBeVisible();
  const loadingBox = await publishingButton.boundingBox();

  expect(loadingBox?.width).toBeGreaterThan(idleBox?.width ?? 0);
  expect(loadingBox?.height).toBe(idleBox?.height);
  expect((loadingBox?.x ?? 0) + (loadingBox?.width ?? 0)).toBeCloseTo((idleBox?.x ?? 0) + (idleBox?.width ?? 0), 0);
  const screenshot = await dialog.screenshot({ path: SCREENSHOT_PATH });
  await testInfo.attach('wordpress-publish-loading-button-fluid-width', { body: screenshot, contentType: 'image/png' });
});
