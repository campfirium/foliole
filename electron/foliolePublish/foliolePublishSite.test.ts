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

it('opens on a compact Topic list and emits stable card pages, archive, and RSS', () => {
  const root = temporaryRoot();
  const first = upsertPublishedCard(emptyPublishIndex(), { nodeId: 'one', title: 'Older' });
  writeFileAtomic(path.join(root, first.card.file), 'Older body');
  const second = upsertPublishedCard(first.index, { nodeId: 'two', title: 'Newest' });
  writeFileAtomic(path.join(root, second.card.file), 'Newest **body**');

  const entry = generateFoliolePublishSite(root, second.index, 'https://notes.example.com');

  expect(fs.readFileSync(entry, 'utf8')).toContain('<h1>Topics</h1>');
  expect(fs.readFileSync(entry, 'utf8')).toContain(`href="cards/${second.card.id}.html"`);
  expect(fs.readFileSync(entry, 'utf8')).toContain(`href="cards/${first.card.id}.html"`);
  expect(fs.readFileSync(entry, 'utf8')).not.toContain('keyboard-hint');
  expect(fs.readFileSync(path.join(root, 'Site', 'cards', `${first.card.id}.html`), 'utf8'))
    .toContain('<a aria-label="All topics" class="back-link" href="../index.html"><span aria-hidden="true">←</span>All topics</a>');
  expect(fs.readFileSync(path.join(root, 'Site', 'archive.html'), 'utf8')).toContain('Older');
  const feed = fs.readFileSync(path.join(root, 'Site', 'rss.xml'), 'utf8');
  expect(feed).toContain('<description>Topics published with Foliole.</description>');
  expect(feed).toContain('https://notes.example.com/cards/');
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

  const page = fs.readFileSync(path.join(staged, 'cards', `${published.card.id}.html`), 'utf8');
  const archive = fs.readFileSync(path.join(staged, 'archive.html'), 'utf8');
  expect(page).toContain('<h1>&lt;Newest&gt;</h1>');
  expect(page).toContain('<dt>category</dt><dd><span>essays</span></dd>');
  expect(page).toContain('<dt>tags</dt><dd><span>design</span><span>notes</span></dd>');
  expect(page).not.toContain('empty_scalar');
  expect(page).not.toContain('empty_list');
  expect(page).toContain('&lt;script&gt;alert(1)&lt;/script&gt; <strong>safe</strong>');
  expect(archive).toContain('&lt;Newest&gt;');
  expect(archive).toContain(`href="cards/${published.card.id}.html"`);
});

it('exposes stable page, navigation, site, card, and field data to Liquid', () => {
  const root = temporaryRoot();
  const older = upsertPublishedCard(emptyPublishIndex(), { nodeId: 'older', title: 'Older topic' });
  writeFileAtomic(path.join(root, older.card.file), 'Older body');
  const newer = upsertPublishedCard(older.index, { nodeId: 'newer', title: 'Newer topic' });
  writeFileAtomic(path.join(root, newer.card.file), 'Newer body');
  const theme = resetFoliolePublishThemeFiles(root);
  fs.writeFileSync(path.join(theme, 'page.html'), [
    '{{ site.title }}|{{ site.url }}|{{ site.home_url }}|{{ site.archive_url }}|{{ site.rss_url }}',
    '{{ page.kind }}|{{ page.id }}|{{ page.is_home }}|{{ page.published_at }}|{{ page.updated_at }}',
    '{{ page.home_url }}|{{ page.archive_url }}|{{ page.rss_url }}',
    '{% if page.older %}{{ page.older.title }}|{{ page.older.url }}{% endif %}'
  ].join('\n'));

  const staged = stageFoliolePublishSite(root, newer.index, 'https://notes.example.com');
  const home = fs.readFileSync(path.join(staged, 'index.html'), 'utf8');

  expect(home).toContain('Foliole|https://notes.example.com|index.html|archive.html|rss.xml');
  expect(home).toContain(`card|${newer.card.id}|true|${newer.card.published_at}|${newer.card.updated_at}`);
  expect(home).toContain(`Older topic|cards/${older.card.id}.html`);
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

  expect(() => stageFoliolePublishSite(root, emptyPublishIndex(), 'https://new.pages.dev')).toThrow(
    /Theme file page\.html has a Liquid error at line 1, column 4: undefined variable: missing/u
  );
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
