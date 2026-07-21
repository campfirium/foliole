import fs from 'node:fs';
import path from 'node:path';

import { expect, test } from './harness/fixtures';

const SCREENSHOT = path.resolve('.tmp/artifacts/desktop-acceptance/foliole-web-publish-dialog.png');

test('shows Web Publish fields and generates the local site with the editable Liquid Theme', async ({ desktopApp, desktopWindow }) => {
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

  const libraryHome = await desktopApp.evaluate(() => process.env.FOLIOLE_LIBRARY_HOME ?? null);
  if (!libraryHome) throw new Error('missing isolated library home');
  await desktopWindow.evaluate(() => globalThis.window?.electronAPI?.invoke('reset_foliole_publish_theme'));
  const theme = path.join(libraryHome, 'Publish', 'Theme');
  fs.writeFileSync(path.join(theme, 'page.html'), '<!doctype html><body>{% if page.kind == "card" %}<h1 data-liquid="card">{{ page.title }}</h1>{% endif %}</body>');
  fs.writeFileSync(path.join(theme, 'archive.html'), '<!doctype html><ol>{% for card in site.cards %}<li data-liquid="archive">{{ card.title }}</li>{% endfor %}</ol>');
  const generated = await desktopWindow.evaluate(() => (
    globalThis.window?.electronAPI?.invoke('update_foliole_publish_local_pages') ?? null
  ));
  expect(generated).toMatchObject({ local_path: path.join(libraryHome, 'Publish', 'Site', 'index.html') });
  expect(fs.readFileSync(path.join(libraryHome, 'Publish', 'Site', 'index.html'), 'utf8'))
    .toContain('<h1 data-liquid="card">This is Foliole Publish</h1>');
  expect(fs.readFileSync(path.join(libraryHome, 'Publish', 'Site', 'archive.html'), 'utf8')
    .match(/data-liquid="archive"/gu)).toHaveLength(3);
  await desktopWindow.screenshot({ path: SCREENSHOT });
});
