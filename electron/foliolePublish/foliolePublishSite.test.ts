import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it, vi } from 'vitest';

import { emptyPublishIndex, upsertPublishedCard, writeFileAtomic } from './foliolePublishModel.js';
import { activateFoliolePublishSite, generateFoliolePublishSite, stageFoliolePublishSite } from './foliolePublishSite.js';
import { resetFoliolePublishThemeFiles } from './foliolePublishTheme.js';

const roots: string[] = [];
function temporaryRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-publish-site-'));
  roots.push(root);
  return root;
}
afterEach(() => roots.splice(0).forEach((root) => fs.rmSync(root, { force: true, recursive: true })));

it('opens on the newest card and emits stable card pages, archive, and RSS', () => {
  const root = temporaryRoot();
  const first = upsertPublishedCard(emptyPublishIndex(), { nodeId: 'one', title: 'Older' });
  writeFileAtomic(path.join(root, first.card.file), 'Older body');
  const second = upsertPublishedCard(first.index, { nodeId: 'two', title: 'Newest' });
  writeFileAtomic(path.join(root, second.card.file), 'Newest **body**');

  const entry = generateFoliolePublishSite(root, second.index, 'https://notes.example.com');

  expect(fs.readFileSync(entry, 'utf8')).toContain('<h1>Newest</h1>');
  expect(fs.readFileSync(entry, 'utf8')).toContain(`data-older-url="cards/${first.card.id}.html"`);
  expect(fs.readFileSync(entry, 'utf8')).not.toContain('data-newer-url=');
  expect(fs.readFileSync(path.join(root, 'Site', 'cards', `${first.card.id}.html`), 'utf8'))
    .toContain(`data-newer-url="./${second.card.id}.html"`);
  expect(fs.readFileSync(path.join(root, 'Site', 'archive.html'), 'utf8')).toContain('Older');
  expect(fs.readFileSync(path.join(root, 'Site', 'rss.xml'), 'utf8')).toContain('https://notes.example.com/cards/');
  expect(fs.existsSync(path.join(root, 'Site', 'cards', `${second.card.id}.html`))).toBe(true);
});

it('renders scalar and list fields through Liquid while escaping public values', () => {
  const root = temporaryRoot();
  const published = upsertPublishedCard(emptyPublishIndex(), { nodeId: 'one', title: '<Newest>' });
  writeFileAtomic(path.join(root, published.card.file), 'Stored body');
  const staged = stageFoliolePublishSite(root, published.index, 'https://notes.example.com', new Map([[
    published.card.id,
    {
      content: 'Hello <script>alert(1)</script> **safe**',
      fields: [
        { key: 'category', value: 'essays' },
        { key: 'tags', value: ['design', 'notes'] },
        { key: 'empty_scalar', value: '' },
        { key: 'empty_list', value: [] }
      ]
    }
  ]]));

  const page = fs.readFileSync(path.join(staged, 'index.html'), 'utf8');
  const archive = fs.readFileSync(path.join(staged, 'archive.html'), 'utf8');
  expect(page).toContain('<h1>&lt;Newest&gt;</h1>');
  expect(page).toContain('<dt>category</dt><dd>essays</dd><dt>tags</dt><dd>design, notes</dd>');
  expect(page).not.toContain('empty_scalar');
  expect(page).not.toContain('empty_list');
  expect(page).toContain('&lt;script&gt;alert(1)&lt;/script&gt; <strong>safe</strong>');
  expect(archive).toContain('&lt;Newest&gt;');
  expect(archive).toContain(`href="cards/${published.card.id}.html"`);
});

it('lets the single Theme control field and archive item markup with Liquid', () => {
  const root = temporaryRoot();
  const theme = resetFoliolePublishThemeFiles(root);
  fs.writeFileSync(path.join(theme, 'page.html'), '{% for field in page.fields %}<x-field>{{ field.key }}={{ field.values | join: "|" }}</x-field>{% endfor %}');
  fs.writeFileSync(path.join(theme, 'archive.html'), '{% for card in site.cards %}<x-card path="{{ card.path }}">{{ card.title }}</x-card>{% endfor %}');
  const published = upsertPublishedCard(emptyPublishIndex(), { nodeId: 'one', title: 'Custom card' });
  writeFileAtomic(path.join(root, published.card.file), 'Body');

  const staged = stageFoliolePublishSite(root, published.index, '', new Map([[
    published.card.id, { content: 'Body', fields: [{ key: 'tags', value: ['one', 'two'] }] }
  ]]));

  expect(fs.readFileSync(path.join(staged, 'index.html'), 'utf8')).toContain('<x-field>tags=one|two</x-field>');
  expect(fs.readFileSync(path.join(staged, 'archive.html'), 'utf8'))
    .toContain(`<x-card path="cards/${published.card.id}.html">Custom card</x-card>`);
});

it('keeps the active site and removes staging files when Liquid rendering fails', () => {
  const root = temporaryRoot();
  const active = generateFoliolePublishSite(root, emptyPublishIndex(), 'https://old.pages.dev');
  const before = fs.readFileSync(active, 'utf8');
  fs.writeFileSync(path.join(root, 'Theme', 'page.html'), '{{ missing }}');

  expect(() => stageFoliolePublishSite(root, emptyPublishIndex(), 'https://new.pages.dev')).toThrow();
  expect(fs.readFileSync(active, 'utf8')).toBe(before);
  expect(fs.readdirSync(root).filter((name) => name.startsWith('.Site-'))).toEqual([]);
});

it('uses the built-in walkthrough when no Topic has been published', () => {
  const root = temporaryRoot();
  const entry = generateFoliolePublishSite(root, emptyPublishIndex(), '');

  expect(fs.readFileSync(entry, 'utf8')).toContain('This is Foliole Publish');
  expect(fs.readFileSync(path.join(root, 'Site', 'cards', 'tutorial-1.html'), 'utf8')).toContain('Only the Topic');
});

it('restores the exact active site when a staged activation rolls back', () => {
  const root = temporaryRoot();
  const current = generateFoliolePublishSite(root, emptyPublishIndex(), 'https://old.pages.dev');
  const oldRss = fs.readFileSync(path.join(root, 'Site', 'rss.xml'), 'utf8');
  const staged = stageFoliolePublishSite(root, emptyPublishIndex(), 'https://new.example.com');
  const activation = activateFoliolePublishSite(root, staged);
  expect(fs.readFileSync(path.join(root, 'Site', 'rss.xml'), 'utf8')).toContain('https://new.example.com');
  activation.rollback();
  expect(fs.readFileSync(path.join(root, 'Site', 'rss.xml'), 'utf8')).toBe(oldRss);
  expect(fs.existsSync(current)).toBe(true);
});

it('keeps the new active site when old backup cleanup fails after commit', () => {
  const root = temporaryRoot();
  generateFoliolePublishSite(root, emptyPublishIndex(), 'https://old.pages.dev');
  const staged = stageFoliolePublishSite(root, emptyPublishIndex(), 'https://new.example.com');
  const activation = activateFoliolePublishSite(root, staged);
  const remove = vi.spyOn(fs, 'rmSync').mockImplementationOnce(() => { throw new Error('cleanup failed'); });
  expect(() => activation.commit()).not.toThrow();
  remove.mockRestore();
  expect(fs.readFileSync(path.join(root, 'Site', 'rss.xml'), 'utf8')).toContain('https://new.example.com');
});
