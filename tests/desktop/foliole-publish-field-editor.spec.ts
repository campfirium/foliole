import path from 'node:path';

import { expect, test } from './harness/fixtures';

const SCREENSHOT = path.resolve('.tmp/artifacts/desktop-acceptance/foliole-publish-field-editor.png');

test('uses compact field actions and chip editing for site publish values', async ({ desktopWindow }) => {
  await desktopWindow.evaluate(() => {
    window.dispatchEvent(new CustomEvent('foliole:web-publish-dialog-request', { detail: {
      content: '---\ncategory: demo\ntags: [design, reading]\n---\n# Local preview',
      nodeId: 'playwright-web-publish-fields',
      settings: {
        account_id: '', has_credentials: false, pages_url: '', project_name: '', site_address: '', updated_at: null,
        field_catalog: [
          { key: 'category', multiple: false, recent_values: ['demo', 'learning', 'tools', 'programming'] },
          { key: 'tags', multiple: true, recent_values: [['design', 'reading'], ['research', 'code', 'memory']] }
        ]
      },
      title: 'Local preview'
    } }));
  });

  const dialog = desktopWindow.getByRole('dialog', { name: 'Publish to the site' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: /^(Remove design|移除 design)$/u })).toBeVisible();
  await expect(dialog.getByRole('button', { name: /^(Remove reading|移除 reading)$/u })).toBeVisible();
  await expect(dialog.getByText('Single value')).toHaveCount(0);
  await expect(dialog.getByText('Multiple values')).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: /^(Use one value|改为单值)$/u })).toBeVisible();
  await expect(dialog.getByRole('button', { name: '2 learning' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: '5 memory' })).toBeVisible();

  const values = dialog.getByRole('textbox', { name: /^(Comma-separated values|用逗号分隔多个值)$/u });
  await values.fill('research');
  await values.press('Enter');
  await expect(dialog.getByRole('button', { name: /^(Remove research|移除 research)$/u })).toBeVisible();
  await dialog.screenshot({ path: SCREENSHOT });
});
