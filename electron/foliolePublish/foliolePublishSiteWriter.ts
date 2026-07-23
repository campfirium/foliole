import fs from 'node:fs';
import path from 'node:path';

import type { FoliolePublishIndex } from './foliolePublishModel.js';
import {
  cardsForTerm,
  groupCardsByUpdatedYear,
  projectPublishedCards,
  searchIndexScript,
  taxonomyIndex,
  type FoliolePublishCardSource,
  type FoliolePublishProjectedCard
} from './foliolePublishSiteProjection.js';
import {
  renderFoliolePublishTemplate,
  type FoliolePublishTemplatePage,
  type FoliolePublishTemplateSite,
  type FoliolePublishTemplateTaxonomyTerm
} from './foliolePublishTemplate.js';

type Theme = Record<'archive.html' | 'page.html' | 'site.js' | 'style.css', string>;

function escapeHtml(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function siteScope(index: FoliolePublishIndex, cards: FoliolePublishProjectedCard[], url: string): FoliolePublishTemplateSite {
  return {
    archive_url: 'archive.html', cards, categories_url: 'categories.html', home_url: 'index.html',
    rss_url: 'rss.xml', search_url: 'search.html', tags_url: 'tags.html', title: index.site.title, url
  };
}

function pageScope(args: {
  cards?: FoliolePublishProjectedCard[]; depth?: '' | '../'; featured?: FoliolePublishProjectedCard | undefined;
  groups?: ReturnType<typeof groupCardsByUpdatedYear>; next?: string | undefined; previous?: string | undefined;
  site: FoliolePublishTemplateSite; taxonomyName?: string; terms?: FoliolePublishTemplateTaxonomyTerm[];
  title: string; view: FoliolePublishTemplatePage['view'];
}): FoliolePublishTemplatePage {
  const depth = args.depth ?? '';
  const featured = args.featured;
  return {
    archive_url: `${depth}archive.html`, cards: args.cards ?? [], categories_url: `${depth}categories.html`,
    content: featured?.content ?? '', depth, fields: featured?.fields ?? [], groups: args.groups ?? [],
    has_visible_fields: Boolean(featured?.fields.some((field) => field.values.length > 0)),
    home_url: `${depth}index.html`, id: featured?.id ?? null,
    is_home: args.view === 'home', kind: args.view === 'article' || args.view === 'home' ? 'card' : 'archive',
    newer: null, newer_url: null, next_page_url: args.next ?? null, older: null, older_url: null,
    previous_page_url: args.previous ?? null, published_at: featured?.published_at ?? null,
    rss_url: `${depth}rss.xml`, search_url: `${depth}search.html`, tags_url: `${depth}tags.html`,
    taxonomy_name: args.taxonomyName ?? null, terms: args.terms ?? [], title: args.title,
    updated_at: featured?.updated_at ?? null, view: args.view
  };
}

function render(template: string, page: FoliolePublishTemplatePage, site: FoliolePublishTemplateSite, source: string) {
  return renderFoliolePublishTemplate(template, { page, site }, source);
}

function write(file: string, contents: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents);
}

function writeHomePages(root: string, cards: FoliolePublishProjectedCard[], site: FoliolePublishTemplateSite, template: string) {
  const pageSize = 5;
  const count = Math.max(1, Math.ceil(cards.length / pageSize));
  for (let index = 0; index < count; index += 1) {
    const pageCards = cards.slice(index * pageSize, (index + 1) * pageSize);
    const filename = index === 0 ? 'index.html' : `page-${index + 1}.html`;
    const previous = index === 0 ? undefined : index === 1 ? 'index.html' : `page-${index}.html`;
    const next = index + 1 < count ? `page-${index + 2}.html` : undefined;
    const page = pageScope({ cards: pageCards, featured: pageCards[0] ?? cards[0], next, previous, site, title: site.title, view: 'home' });
    if (index === 0 && cards[1]) {
      page.older = { title: cards[1].title, url: `cards/${cards[1].id}.html` };
      page.older_url = page.older.url;
    }
    write(path.join(root, filename), render(template, page, site, 'page.html'));
  }
}

function writeArticles(root: string, cards: FoliolePublishProjectedCard[], site: FoliolePublishTemplateSite, template: string) {
  cards.forEach((card, index) => {
    const page = pageScope({ depth: '../', featured: card, site, title: card.title, view: 'article' });
    const neighbor = (item: FoliolePublishProjectedCard | undefined) => item
      ? { title: item.title, url: `../cards/${item.id}.html` } : null;
    page.newer = neighbor(cards[index - 1]);
    page.newer_url = page.newer?.url ?? null;
    page.older = neighbor(cards[index + 1]);
    page.older_url = page.older?.url ?? null;
    write(path.join(root, card.path), render(template, page, site, 'page.html'));
  });
}

function writeTaxonomy(root: string, cards: FoliolePublishProjectedCard[], site: FoliolePublishTemplateSite, template: string, key: 'categories' | 'tags') {
  const terms = taxonomyIndex(cards, key);
  const view = key === 'categories' ? 'categories' : 'tags';
  const resultView = key === 'categories' ? 'category' : 'tag';
  write(path.join(root, `${key}.html`), render(template, pageScope({ site, terms, title: key === 'categories' ? 'Categories' : 'Tags', view }), site, 'archive.html'));
  terms.forEach((term) => {
    const selected = cardsForTerm(cards, key, term.slug);
    const page = pageScope({ cards: selected, depth: '../', groups: groupCardsByUpdatedYear(selected), site, taxonomyName: term.name, title: term.name, view: resultView });
    write(path.join(root, key, `${term.slug}.html`), render(template, page, site, 'archive.html'));
  });
}

function rss(cards: FoliolePublishProjectedCard[], site: FoliolePublishTemplateSite) {
  const items = cards.map((card) => {
    const url = `${site.url}/cards/${card.id}.html`;
    const description = card.content.replaceAll(']]>', ']]]]><![CDATA[>');
    return `<item><title>${escapeHtml(card.title)}</title><link>${escapeHtml(url)}</link><guid>${escapeHtml(url)}</guid><pubDate>${new Date(card.updated_at).toUTCString()}</pubDate><description><![CDATA[${description}]]></description></item>`;
  }).join('');
  const lastBuildDate = cards[0] ? `<lastBuildDate>${new Date(cards[0].updated_at).toUTCString()}</lastBuildDate>` : '';
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${escapeHtml(site.title)}</title><link>${escapeHtml(`${site.url}/`)}</link><description>Topics published with Foliole.</description>${lastBuildDate}<generator>Foliole Publish</generator>${items}</channel></rss>`;
}

export function writeFoliolePublishSite(args: {
  index: FoliolePublishIndex; publicAddress: string; root: string; sources: FoliolePublishCardSource[]; theme: Theme;
}) {
  const cards = projectPublishedCards(args.sources);
  const site = siteScope(args.index, cards, args.publicAddress);
  writeHomePages(args.root, cards, site, args.theme['page.html']);
  writeArticles(args.root, cards, site, args.theme['page.html']);
  const archive = pageScope({ cards, groups: groupCardsByUpdatedYear(cards), site, title: 'Archive', view: 'archive' });
  write(path.join(args.root, 'archive.html'), render(args.theme['archive.html'], archive, site, 'archive.html'));
  writeTaxonomy(args.root, cards, site, args.theme['archive.html'], 'categories');
  writeTaxonomy(args.root, cards, site, args.theme['archive.html'], 'tags');
  const search = pageScope({ site, title: 'Search', view: 'search' });
  write(path.join(args.root, 'search.html'), render(args.theme['archive.html'], search, site, 'archive.html'));
  write(path.join(args.root, 'search-index.js'), searchIndexScript(cards));
  write(path.join(args.root, 'style.css'), args.theme['style.css']);
  write(path.join(args.root, 'site.js'), args.theme['site.js']);
  write(path.join(args.root, 'rss.xml'), rss(cards, site));
}
