import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { readFolioleWebBinding, readFolioleWebMarkdown, type FolioleWebField } from '../../lib/core/foliolePublish/folioleWebPublishFrontmatter.js';
import { convertWordPressMarkdownToHtml } from '../../lib/core/wordpress/wordpressMarkdownHtml.js';

import type { FoliolePublishCard, FoliolePublishIndex } from './foliolePublishModel.js';
import {
  renderFoliolePublishTemplate,
  type FoliolePublishTemplateField,
  type FoliolePublishTemplatePage,
  type FoliolePublishTemplateSite
} from './foliolePublishTemplate.js';
import { readFoliolePublishTheme } from './foliolePublishTheme.js';

function escapeHtml(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function tutorialIndex(): FoliolePublishIndex {
  const now = new Date().toISOString();
  const titles = ['This is Foliole Publish', 'Publish when a card is ready', 'Deploy free with Cloudflare'];
  return { cards: titles.map((title, i) => ({ file: `tutorial-${i}.md`, id: `tutorial-${i}`, published_at: now, title, updated_at: now })), site: { title: 'Foliole Publish' }, version: 1 };
}

const TUTORIAL = [
  'Your public site opens on the newest card. Press **Space** to continue.',
  'Foliole keeps editing private. Only the Topic you explicitly publish becomes part of this site.',
  'Connect a Cloudflare Pages project in Settings. Your first deployment can use a free `pages.dev` address.'
];

function readCard(root: string, card: FoliolePublishCard, tutorial: boolean) {
  const markdown = tutorial ? TUTORIAL[Number(card.id.at(-1))] ?? '' : fs.readFileSync(path.join(root, card.file), 'utf8');
  return { fields: tutorial ? [] : readFolioleWebBinding(markdown)?.fields ?? [], markdown };
}

function templateFields(fields: FolioleWebField[]): FoliolePublishTemplateField[] {
  return fields.map(({ key, value }) => ({
    key,
    values: (Array.isArray(value) ? value : [value]).filter((item) => item.length > 0)
  }));
}

function templateSite(index: FoliolePublishIndex, siteAddress: string): FoliolePublishTemplateSite {
  return {
    archive_url: 'archive.html',
    cards: index.cards.map((card) => ({
      id: card.id,
      path: `cards/${card.id}.html`,
      published_at: card.published_at,
      title: card.title,
      updated_at: card.updated_at
    })),
    home_url: 'index.html',
    rss_url: 'rss.xml',
    title: index.site.title,
    url: siteAddress
  };
}

function cardPage(args: {
  card: FoliolePublishCard; depth: '' | '../'; fields: FolioleWebField[]; markdown: string;
  isHome: boolean; newer: FoliolePublishCard | null; older: FoliolePublishCard | null;
  site: FoliolePublishTemplateSite; template: string;
}) {
  const fields = templateFields(args.fields);
  const neighbor = (card: FoliolePublishCard | null) => card
    ? { title: card.title, url: `${args.depth}cards/${card.id}.html` }
    : null;
  const newer = neighbor(args.newer);
  const older = neighbor(args.older);
  const page: FoliolePublishTemplatePage = {
    archive_url: `${args.depth}archive.html`,
    content: convertWordPressMarkdownToHtml(readFolioleWebMarkdown(args.markdown)),
    depth: args.depth,
    fields,
    has_visible_fields: fields.some((field) => field.values.length > 0),
    home_url: `${args.depth}index.html`,
    id: args.card.id,
    is_home: args.isHome,
    kind: 'card',
    newer,
    newer_url: newer?.url ?? null,
    older,
    older_url: older?.url ?? null,
    published_at: args.card.published_at,
    rss_url: `${args.depth}rss.xml`,
    title: args.card.title,
    updated_at: args.card.updated_at
  };
  return renderFoliolePublishTemplate(args.template, { page, site: args.site }, 'page.html');
}

function archivePage(template: string, site: FoliolePublishTemplateSite) {
  const page: FoliolePublishTemplatePage = {
    archive_url: 'archive.html', content: '', depth: '', fields: [], has_visible_fields: false,
    home_url: 'index.html', id: null, is_home: false, kind: 'archive', newer: null,
    newer_url: null, older: null, older_url: null, published_at: null, rss_url: 'rss.xml',
    title: site.title, updated_at: null
  };
  return renderFoliolePublishTemplate(template, { page, site }, 'archive.html');
}

function rss(index: FoliolePublishIndex, contents: Map<string, string>, siteAddress: string) {
  const items = index.cards.map((card) => {
    const url = `${siteAddress}/cards/${card.id}.html`;
    const description = convertWordPressMarkdownToHtml(readFolioleWebMarkdown(contents.get(card.id) ?? ''))
      .replaceAll(']]>', ']]]]><![CDATA[>');
    return `<item><title>${escapeHtml(card.title)}</title><link>${escapeHtml(url)}</link><guid>${escapeHtml(url)}</guid><pubDate>${new Date(card.updated_at).toUTCString()}</pubDate><description><![CDATA[${description}]]></description></item>`;
  }).join('');
  const lastBuildDate = index.cards[0] ? `<lastBuildDate>${new Date(index.cards[0].updated_at).toUTCString()}</lastBuildDate>` : '';
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${escapeHtml(index.site.title)}</title><link>${escapeHtml(`${siteAddress}/`)}</link><description>Topics published with Foliole.</description>${lastBuildDate}<generator>Foliole Publish</generator>${items}</channel></rss>`;
}

type PublishOverrides = Map<string, { content: string; fields: FolioleWebField[] }>;

function selectCard(root: string, card: FoliolePublishCard, tutorial: boolean, overrides: PublishOverrides) {
  const selected = overrides.get(card.id);
  if (selected) return selected;
  const stored = readCard(root, card, tutorial);
  return { content: stored.markdown, fields: stored.fields };
}

function writeStagedSite(root: string, temporary: string, index: FoliolePublishIndex, siteAddress: string, overrides: PublishOverrides) {
  const tutorial = index.cards.length === 0;
  const source = tutorial ? tutorialIndex() : index;
  const theme = readFoliolePublishTheme(root);
  const publicAddress = siteAddress || 'https://example.pages.dev';
  const site = templateSite(source, publicAddress);
  const selectedCards = source.cards.map((card) => ({ card, selected: selectCard(root, card, tutorial, overrides) }));
  const contents = new Map(selectedCards.map(({ card, selected }) => [card.id, selected.content]));
  selectedCards.forEach(({ card, selected }, i) => {
    fs.writeFileSync(path.join(temporary, 'cards', `${card.id}.html`), cardPage({
      card, depth: '../', fields: selected.fields, markdown: selected.content,
      isHome: false,
      newer: source.cards[i - 1] ?? null,
      older: source.cards[i + 1] ?? null,
      site,
      template: theme['page.html']
    }));
  });
  const latest = selectedCards[0]!;
  fs.writeFileSync(path.join(temporary, 'index.html'), cardPage({
    card: latest.card, depth: '', fields: latest.selected.fields, markdown: latest.selected.content,
    isHome: true, newer: null, older: source.cards[1] ?? null,
    site, template: theme['page.html']
  }));
  fs.writeFileSync(path.join(temporary, 'archive.html'), archivePage(theme['archive.html'], site));
  fs.writeFileSync(path.join(temporary, 'style.css'), theme['style.css']);
  fs.writeFileSync(path.join(temporary, 'site.js'), theme['site.js']);
  fs.writeFileSync(path.join(temporary, 'rss.xml'), rss(source, contents, publicAddress));
}

export function stageFoliolePublishSite(root: string, index: FoliolePublishIndex, siteAddress: string, overrides: PublishOverrides = new Map()) {
  const temporary = path.join(root, `.Site-${randomUUID()}`);
  fs.mkdirSync(path.join(temporary, 'cards'), { recursive: true });
  try {
    writeStagedSite(root, temporary, index, siteAddress, overrides);
  } catch (error) {
    fs.rmSync(temporary, { force: true, recursive: true });
    throw error;
  }
  return temporary;
}

export function activateFoliolePublishSite(root: string, staged: string, directory = 'Site') {
  const destination = path.join(root, directory);
  const backup = path.join(root, `.${directory}-backup-${randomUUID()}`);
  try {
    if (fs.existsSync(destination)) fs.renameSync(destination, backup);
    fs.renameSync(staged, destination);
  } catch (error) {
    if (!fs.existsSync(destination) && fs.existsSync(backup)) fs.renameSync(backup, destination);
    throw error;
  }
  let settled = false;
  return {
    activePath: path.join(destination, 'index.html'),
    commit() { if (!settled) { settled = true; try { fs.rmSync(backup, { force: true, recursive: true }); } catch { return; } } },
    rollback() { if (!settled) { fs.rmSync(destination, { force: true, recursive: true }); if (fs.existsSync(backup)) fs.renameSync(backup, destination); settled = true; } }
  };
}

export function discardStagedFoliolePublishSite(staged: string) { fs.rmSync(staged, { force: true, recursive: true }); }

export function generateFoliolePublishSite(root: string, index: FoliolePublishIndex, siteAddress: string) {
  const staged = stageFoliolePublishSite(root, index, siteAddress);
  try { const activation = activateFoliolePublishSite(root, staged); activation.commit(); return activation.activePath; }
  finally { discardStagedFoliolePublishSite(staged); }
}
