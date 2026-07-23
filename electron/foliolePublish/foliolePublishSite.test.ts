import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it, vi } from 'vitest';

import { emptyPublishIndex, upsertPublishedCard, writeFileAtomic } from './foliolePublishModel.js';
import { activateFoliolePublishSite, generateFoliolePublishSite, stageFoliolePublishSite } from './foliolePublishSite.js';
import { openOrCreateFoliolePublishCustomTheme } from './foliolePublishTheme.js';

const roots: string[] = [];
function temporaryRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-publish-site-'));
  roots.push(root);
  return root;
}
afterEach(() => roots.splice(0).forEach((root) => fs.rmSync(root, { force: true, recursive: true })));

function titledPublishIndex(title = 'Foliole') {
  return { ...emptyPublishIndex(), site: { title } };
}

it('opens on a complete-segment Topic stream and emits stable card pages, archive, search, and RSS', () => {
  const root = temporaryRoot();
  const first = upsertPublishedCard(titledPublishIndex(), { nodeId: 'one', title: 'Older' });
  writeFileAtomic(path.join(root, first.card.file), 'Older body');
  const second = upsertPublishedCard(first.index, { nodeId: 'two', title: 'Newest' });
  writeFileAtomic(path.join(root, second.card.file), 'Newest **body**');

  const entry = generateFoliolePublishSite(root, second.index, 'https://notes.example.com');

  const home = fs.readFileSync(entry, 'utf8');
  expect(home).toContain('<h1 class="home-title">Foliole</h1>');
  expect(home).toContain(`href="cards/${second.card.id}.html"`);
  expect(home).toContain(`href="cards/${first.card.id}.html"`);
  expect(home.match(/class="topic-card"/gu)).toHaveLength(2);
  expect(home).not.toContain('keyboard-hint');
  expect(fs.readFileSync(path.join(root, 'Site', 'cards', `${first.card.id}.html`), 'utf8'))
    .toContain('href="../index.html" aria-label="Home"');
  expect(fs.readFileSync(path.join(root, 'Site', 'archive.html'), 'utf8')).toContain('Older');
  expect(fs.readFileSync(path.join(root, 'Site', 'search.html'), 'utf8')).toContain('src="search-index.js"');
  expect(fs.readFileSync(path.join(root, 'Site', 'search-index.js'), 'utf8')).toContain('Newest');
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
  expect(page).toContain('<h1 class="article-title">&lt;Newest&gt;</h1>');
  expect(page).toContain('<span class="meta-key">Category</span>');
  expect(page).toContain('>essays</a>');
  expect(page).toContain('<span class="meta-key">Tags</span>');
  expect(page).toContain('>#design</a>');
  expect(page).toContain('>#notes</a>');
  expect(page).not.toContain('empty_scalar');
  expect(page).not.toContain('empty_list');
  expect(page).toContain('&lt;script&gt;alert(1)&lt;/script&gt; <strong>safe</strong>');
  expect(archive).toContain('&lt;Newest&gt;');
  expect(archive).toContain(`href="cards/${published.card.id}.html"`);
});

it('paginates five Topics and keeps archive, taxonomy, and search on update order', () => {
  const root = temporaryRoot();
  const cards = Array.from({ length: 6 }, (_, index) => ({
    file: `Content/topic-${index}.md`, id: `topic-${index}`,
    published_at: `2025-01-0${index + 1}T00:00:00.000Z`,
    title: `Topic ${index}`, updated_at: `2026-07-0${index + 1}T00:00:00.000Z`
  })).reverse();
  cards.forEach((card) => writeFileAtomic(path.join(root, card.file), `First segment ${card.title}.\n\nSecond segment.`));
  writeFileAtomic(path.join(root, 'Content', 'private.md'), 'PRIVATE FIXTURE');
  const index = { cards, site: { title: 'Ordered' }, version: 1 as const };

  const staged = stageFoliolePublishSite(root, index, '', new Map(cards.map((card) => [card.id, {
    content: `First segment ${card.title}.\n\nSecond segment.`,
    fields: [{ key: 'Category', value: 'Writing' }, { key: 'tags', value: ['Foliole'] }]
  }])));
  const home = fs.readFileSync(path.join(staged, 'index.html'), 'utf8');
  const second = fs.readFileSync(path.join(staged, 'page-2.html'), 'utf8');
  const archive = fs.readFileSync(path.join(staged, 'archive.html'), 'utf8');
  const searchIndex = fs.readFileSync(path.join(staged, 'search-index.js'), 'utf8');

  expect(home.match(/class="topic-card"/gu)).toHaveLength(5);
  expect(home).toContain('href="page-2.html" rel="next"');
  expect(second.match(/class="topic-card"/gu)).toHaveLength(1);
  expect(second).toContain('href="index.html" rel="prev"');
  expect(home).toContain('<p>First segment Topic 5.</p><a class="continuation"');
  expect(archive.indexOf('Topic 5')).toBeLessThan(archive.indexOf('Topic 0'));
  expect(fs.readFileSync(path.join(staged, 'categories.html'), 'utf8')).toContain('Writing');
  expect(fs.readdirSync(path.join(staged, 'categories'))).toHaveLength(1);
  expect(fs.readFileSync(path.join(staged, 'tags.html'), 'utf8')).toContain('#Foliole');
  expect(fs.readdirSync(path.join(staged, 'tags'))).toHaveLength(1);
  expect(searchIndex).toContain('First segment Topic 5');
  expect(searchIndex).not.toContain('PRIVATE FIXTURE');
  expect(fs.readFileSync(path.join(staged, 'search.html'), 'utf8')).toContain('src="search-index.js"');
});

it('exposes stable page, navigation, site, card, and field data to Liquid', () => {
  const root = temporaryRoot();
  const older = upsertPublishedCard(titledPublishIndex(), { nodeId: 'older', title: 'Older topic' });
  writeFileAtomic(path.join(root, older.card.file), 'Older body');
  const newer = upsertPublishedCard(older.index, { nodeId: 'newer', title: 'Newer topic' });
  writeFileAtomic(path.join(root, newer.card.file), 'Newer body');
  const theme = openOrCreateFoliolePublishCustomTheme(root).path;
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

it('lets Custom Theme control field and archive item markup with Liquid', () => {
  const root = temporaryRoot();
  const theme = openOrCreateFoliolePublishCustomTheme(root).path;
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
  const theme = openOrCreateFoliolePublishCustomTheme(root).path;
  fs.writeFileSync(path.join(theme, 'page.html'), '{{ missing }}');

  expect(() => stageFoliolePublishSite(root, emptyPublishIndex(), 'https://new.pages.dev')).toThrow(
    /Theme file page\.html has a Liquid error at line 1, column 4: undefined variable: missing/u
  );
  expect(fs.readFileSync(active, 'utf8')).toBe(before);
  expect(fs.readdirSync(root).filter((name) => name.startsWith('.Site-'))).toEqual([]);
});

it('renders the poster-like empty publish state with text navigation', () => {
  const root = temporaryRoot();
  const index = { ...emptyPublishIndex(), site: { title: 'Working Memory' } };
  const entry = generateFoliolePublishSite(root, index, '');

  const html = fs.readFileSync(entry, 'utf8');
  expect(html).toContain('class="view home-view is-empty"');
  expect(html).toContain('<section class="empty-publish-state"');
  expect(html).not.toContain('No Topics published yet');
  expect(html).not.toContain('Publish a Topic from Foliole');
  expect(html).toContain('data-empty-publish-activity');
  expect(html).toContain('data-empty-publish-word>Reading...</span>');
  expect(html).toContain('<nav class="empty-home-nav" aria-label="Site navigation">');
  expect(html).not.toContain('<nav class="global-nav"');
  expect(html).not.toContain('empty-topic-stream');
  const navStart = html.indexOf('<nav class="empty-home-nav"');
  const emptyNav = html.slice(navStart, html.indexOf('</nav>', navStart));
  expect(emptyNav).toContain('Home</a>');
  expect(emptyNav.indexOf('Archive</a>')).toBeLessThan(emptyNav.indexOf('Categories</a>'));
  expect(emptyNav.indexOf('Categories</a>')).toBeLessThan(emptyNav.indexOf('Tags</a>'));
  expect(emptyNav.indexOf('Tags</a>')).toBeLessThan(emptyNav.indexOf('Search</a>'));
  expect(emptyNav).not.toContain('RSS');
  expect(html).toContain('rel="alternate" type="application/rss+xml"');
  expect(fs.readdirSync(path.join(root, 'Site', 'cards'))).toEqual([]);
  const script = fs.readFileSync(path.join(root, 'Site', 'site.js'), 'utf8');
  expect(script).toContain("['Reading', 'Thinking', 'Writing']");
  expect(script).toContain("word + '...'");
  expect(script).toContain("matchMedia('(prefers-reduced-motion: reduce)')");
  expect(fs.readFileSync(path.join(root, 'Site', 'rss.xml'), 'utf8')).not.toContain('<item>');
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
