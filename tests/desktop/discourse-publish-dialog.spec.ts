import { expect, test } from './harness/fixtures';

const discourseCatalog = {
  categories: [
    { id: 7, name: '学习 · 折腾', parent_category_id: null, slug: 'study' },
    { id: 8, name: '学习 · 折腾 / 作业赏', parent_category_id: 7, slug: 'homework' },
    { id: 9, name: '工具 · 玩具', parent_category_id: null, slug: 'tools' }
  ],
  fetched_at: null,
  from_cache: false,
  recent_category_ids: [7, 8],
  recent_tags: ['二语习得', '学习'],
  tags: [{ id: '二语习得', name: '二语习得' }, { id: '学习', name: '学习' }, { id: 'obsidian', name: 'obsidian' }]
};

test('shows Discourse publish choices and prefers the body H1 title', async ({ desktopWindow }) => {
  await desktopWindow.evaluate((catalog) => {
    window.dispatchEvent(new CustomEvent('foliole:discourse-publish-dialog-request', {
      detail: {
        catalog,
        content: '# Body H1\n\nLong enough body for preview.',
        nodeId: 'playwright-topic',
        targetSiteUrl: 'https://forum.example.com',
        title: 'Folder title'
      }
    }));
  }, discourseCatalog);

  const dialog = desktopWindow.getByRole('dialog', { name: /^(Publish to Discourse|发布到 Discourse)$/ });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/Topic:\s*Body H1|主题：\s*Body H1/)).toBeVisible();
  await expect(dialog.getByLabel(/^(Category|分类)$/)).toBeVisible();
  await expect(dialog.getByText(/No category|不选择分类/)).toHaveCount(0);
  await expect(dialog.getByLabel(/^(Tags|标签)$/)).toBeVisible();
});

test('supports keyboard-first Discourse category and tag selection', async ({ desktopWindow }) => {
  await desktopWindow.evaluate((catalog) => {
    window.dispatchEvent(new CustomEvent('foliole:discourse-publish-dialog-request', {
      detail: {
        catalog,
        content: '# Keyboard topic\n\nLong enough body for preview.',
        nodeId: 'playwright-topic',
        targetSiteUrl: 'https://forum.example.com',
        title: 'Folder title'
      }
    }));
  }, discourseCatalog);

  const dialog = desktopWindow.getByRole('dialog', { name: /^(Publish to Discourse|发布到 Discourse)$/ });
  await expect(dialog).toBeVisible();

  const category = dialog.getByLabel(/^(Category|分类)$/).first();
  await expect(category).toBeFocused();
  await desktopWindow.keyboard.press('2');
  await expect(category).not.toHaveText(/No category|不选择分类/);

  await desktopWindow.keyboard.press('Tab');
  const tags = dialog.getByLabel(/^(Tags|标签)$/).first();
  await expect(tags).toBeFocused();
  await desktopWindow.keyboard.press('1');
  await expect(dialog.getByText('二语习得')).toBeVisible();
  await desktopWindow.keyboard.press('0');
  await expect(dialog.getByPlaceholder(/^(All tags|全部标签)$/)).toBeVisible();

  await desktopWindow.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: /^(Publish|发布)$/ })).toBeFocused();
  await desktopWindow.screenshot({ path: '.tmp/artifacts/discourse-publish-keyboard-controls-hidden-native.png' });
});
