import { expect, test } from './harness/fixtures';

const discourseCatalog = {
  categories: [
    { id: 7, name: '学习 · 折腾', parent_category_id: null, slug: 'study' },
    { id: 8, name: '学习 · 折腾 / 作业赏', parent_category_id: 7, slug: 'homework' },
    { id: 9, name: '工具 · 玩具', parent_category_id: null, slug: 'tools' },
    { id: 10, name: 'AI', parent_category_id: null, slug: 'ai' },
    { id: 11, name: '法律', parent_category_id: null, slug: 'law' },
    { id: 12, name: '翻译', parent_category_id: null, slug: 'translation' },
    { id: 13, name: '写作', parent_category_id: null, slug: 'writing' },
    { id: 14, name: '产品', parent_category_id: null, slug: 'product' },
    { id: 15, name: '编程', parent_category_id: null, slug: 'programming' }
  ],
  fetched_at: null,
  from_cache: false,
  recent_category_ids: [8],
  recent_tags: ['二语习得', '学习'],
  tags: [
    { id: '二语习得', name: '二语习得' },
    { id: '学习', name: '学习' },
    { id: 'obsidian', name: 'obsidian' },
    { id: 'anki', name: 'anki' },
    { id: '番茄钟', name: '番茄钟' },
    { id: '应用', name: '应用' },
    { id: '字幕', name: '字幕' },
    { id: '输入法', name: '输入法' },
    { id: '记忆', name: '记忆' },
    { id: 'alpha', name: 'alpha' }
  ]
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
  await expect(dialog.getByText(/Topic:|主题：/)).toHaveCount(0);
  await expect(dialog.getByLabel(/^(Category|分类)$/)).toBeVisible();
  await expect(dialog.getByLabel(/^(Category|分类)$/)).toContainText('作业赏');
  await expect(dialog.getByText(/No category|不选择分类/)).toHaveCount(0);
  await expect(dialog.getByLabel(/^(Tags|标签)$/)).toBeVisible();
  await expect(dialog.getByText('二语习得').first()).toBeVisible();
});

test('closes the Discourse publish dialog on Escape', async ({ desktopWindow }) => {
  await desktopWindow.evaluate((catalog) => {
    window.dispatchEvent(new CustomEvent('foliole:discourse-publish-dialog-request', {
      detail: {
        catalog,
        content: '# Escape topic\n\nLong enough body for preview.',
        nodeId: 'playwright-topic',
        targetSiteUrl: 'https://forum.example.com',
        title: 'Folder title'
      }
    }));
  }, discourseCatalog);

  const dialog = desktopWindow.getByRole('dialog', { name: /^(Publish to Discourse|发布到 Discourse)$/ });
  await expect(dialog).toBeVisible();
  await desktopWindow.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('restores failed publishing choices without restoring the old error', async ({ desktopWindow }) => {
  await desktopWindow.evaluate(async (catalog) => {
    await window.electronAPI?.invoke('disconnect_discourse_publish_settings');
    await window.electronAPI?.invoke('save_discourse_publish_settings', {
      settings: { site_url: 'https://forum.example.com' }
    });
    window.dispatchEvent(new CustomEvent('foliole:discourse-publish-dialog-request', {
      detail: {
        catalog,
        content: '# Draft recovery topic\n\nLong enough body for preview.',
        nodeId: 'playwright-draft-recovery-topic',
        title: 'Folder title'
      }
    }));
  }, discourseCatalog);

  const dialog = desktopWindow.getByRole('dialog', { name: /^(Publish to Discourse|发布到 Discourse)$/ });
  const category = dialog.getByLabel(/^(Category|分类)$/).first();
  await expect(category).toBeFocused();
  await desktopWindow.keyboard.press('3');
  await expect(category).toContainText('工具 · 玩具');
  const tags = dialog.getByLabel(/^(Tags|标签)$/).first();
  await tags.fill('saved-choice');
  await desktopWindow.keyboard.press('Enter');
  await dialog.getByRole('button', { name: /^(Publish|发布)$/ }).click();
  await expect(dialog.getByRole('alert')).toContainText('not configured');
  await dialog.getByRole('button', { name: /^(Cancel|取消)$/ }).click();
  await expect(dialog).toHaveCount(0);

  await desktopWindow.evaluate((catalog) => {
    window.dispatchEvent(new CustomEvent('foliole:discourse-publish-dialog-request', {
      detail: {
        catalog,
        content: '# Draft recovery topic\n\nLong enough body for preview.',
        nodeId: 'playwright-draft-recovery-topic',
        title: 'Folder title'
      }
    }));
  }, discourseCatalog);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel(/^(Category|分类)$/).first()).toContainText('工具 · 玩具');
  await expect(dialog.getByText('saved-choice').first()).toBeVisible();
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  await desktopWindow.screenshot({
    path: '.tmp/artifacts/discourse-publish-draft-recovery-hidden-native.png'
  });
});

test('supports keyboard-first Discourse category selection', async ({ desktopWindow }) => {
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
  await expect(category).toContainText('作业赏');
  await desktopWindow.keyboard.press('0');
  await expect(dialog.getByRole('listbox')).toHaveCount(0);
  await desktopWindow.keyboard.press('Enter');
  await expect(dialog.getByRole('listbox')).toBeVisible();
  await desktopWindow.keyboard.press('Escape');
  await expect(dialog.getByRole('listbox')).toHaveCount(0);
  await category.focus();
  await desktopWindow.keyboard.press('2');
  await expect(category).toContainText('作业赏');
});

test('supports keyboard-first Discourse tag selection and creation', async ({ desktopWindow }) => {
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
  await expect(dialog.getByLabel(/^(Category|分类)$/)).toContainText('作业赏');
  await desktopWindow.keyboard.press('Tab');
  const tags = dialog.getByLabel(/^(Tags|标签)$/).first();
  await expect(tags).toBeFocused();
  await expect(dialog.getByText('二语习得').first()).toBeVisible();
  await desktopWindow.keyboard.press('3');
  await expect(dialog.getByText('obsidian').first()).toBeVisible();
  await tags.fill('al');
  await desktopWindow.keyboard.press('1');
  await expect(dialog.getByText('alpha').first()).toBeVisible();
  await expect(tags).toHaveValue('');
  await tags.fill('abc');
  await expect(dialog.getByRole('button', { name: 'Enter + abc' })).toBeVisible();
  await desktopWindow.keyboard.press('Enter');
  await expect(dialog.getByText('abc').first()).toBeVisible();
  await expect(tags).toHaveValue('');
  await desktopWindow.keyboard.press('0');
  await expect(dialog.getByLabel(/^(Tags|标签)$/)).toHaveCount(2);
  const panelTags = dialog.getByLabel(/^(Tags|标签)$/).nth(1);
  await panelTags.fill('10001');
  await expect(dialog.getByRole('button', { name: 'Enter + 10001' })).toBeVisible();
  await desktopWindow.keyboard.press('Enter');
  await expect(dialog.getByText('10001').first()).toBeVisible();
  await expect(panelTags).toHaveValue('');
  await desktopWindow.keyboard.press('Escape');
  await expect(dialog.getByLabel(/^(Tags|标签)$/)).toHaveCount(1);
  await tags.focus();
  await desktopWindow.keyboard.press('0');
  const reopenedPanelTags = dialog.getByLabel(/^(Tags|标签)$/).nth(1);
  await expect(reopenedPanelTags).toHaveValue('');
  await desktopWindow.keyboard.press('Escape');

  await tags.focus();
  await desktopWindow.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: /^(Publish|发布)$/ })).toBeFocused();
  await desktopWindow.screenshot({ path: '.tmp/artifacts/discourse-publish-keyboard-controls-hidden-native.png' });
});
