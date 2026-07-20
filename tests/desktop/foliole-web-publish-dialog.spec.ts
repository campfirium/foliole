import path from 'node:path';

import { expect, test } from './harness/fixtures';

const SCREENSHOT = path.resolve('.tmp/artifacts/desktop-acceptance/foliole-web-publish-dialog.png');

test('shows YAML-backed Web Publish fields while keeping Preview available without hosting', async ({ desktopWindow }) => {
  await desktopWindow.evaluate(() => {
    window.dispatchEvent(new CustomEvent('foliole:web-publish-dialog-request', { detail: {
      content: '---\ncategory: essays\ntags: [design, notes]\n---\n# Local preview\n\nCandidate body.',
      nodeId: 'playwright-web-publish-topic',
      settings: {
        account_id: '', field_catalog: [{ key: 'author', multiple: false, recent_values: ['Roamer'] }],
        has_credentials: false, pages_url: '', project_name: '', site_address: '', updated_at: null
      },
      title: 'Local preview'
    } }));
  });

  const dialog = desktopWindow.getByRole('dialog', { name: /^(Publish to the web|发布到网站)$/u });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: /category/u })).toBeVisible();
  await expect(dialog.getByRole('button', { name: /tags/u })).toBeVisible();
  await expect(dialog.getByRole('button', { name: /author/u })).toBeVisible();
  await expect(dialog.getByRole('button', { name: /^(Preview|预览)$/u })).toBeEnabled();
  await expect(dialog.getByRole('button', { name: /^(Publish|发布)$/u })).toBeDisabled();
  await expect(dialog.getByRole('button', { name: /^(Open theme|打开主题)$/u })).toBeVisible();
  await expect(dialog.getByRole('button', { name: /^(Reset theme|重置主题)$/u })).toBeVisible();
  await desktopWindow.screenshot({ path: SCREENSHOT });
});
