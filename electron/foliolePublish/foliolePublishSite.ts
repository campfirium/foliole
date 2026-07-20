import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { readFolioleWebBinding, readFolioleWebMarkdown, type FolioleWebField } from '../../lib/core/foliolePublish/folioleWebPublishFrontmatter.js';
import { convertWordPressMarkdownToHtml } from '../../lib/core/wordpress/wordpressMarkdownHtml.js';

import type { FoliolePublishCard, FoliolePublishIndex } from './foliolePublishModel.js';
import { readFoliolePublishTheme } from './foliolePublishTheme.js';

function escapeHtml(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function render(template: string, values: Record<string, string>) {
  return template.replace(/\{\{([A-Za-z]+)\}\}/gu, (token, key: string) => values[key] ?? token);
}

function renderFields(fields: FolioleWebField[]) {
  const entries = fields.flatMap(({ key, value }) => {
    const text = Array.isArray(value) ? value.join(', ') : value;
    return text.length > 0 ? `<dt>${escapeHtml(key)}</dt><dd>${escapeHtml(text)}</dd>` : [];
  });
  return entries.length > 0 ? `<dl class="fields">${entries.join('')}</dl>` : '';
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

function cardPage(args: {
  card: FoliolePublishCard; depth: string; fields: FolioleWebField[]; markdown: string;
  newer: string | null; older: string | null; template: string;
}) {
  return render(args.template, {
    archiveUrl: JSON.stringify(`${args.depth}archive.html`),
    content: convertWordPressMarkdownToHtml(readFolioleWebMarkdown(args.markdown)),
    depth: args.depth,
    fields: renderFields(args.fields),
    newerUrl: JSON.stringify(args.newer),
    olderUrl: JSON.stringify(args.older),
    title: escapeHtml(args.card.title)
  });
}

function rss(index: FoliolePublishIndex, contents: Map<string, string>, siteAddress: string) {
  const items = index.cards.map((card) => `<item><title>${escapeHtml(card.title)}</title><link>${siteAddress}/cards/${card.id}.html</link><guid>${siteAddress}/cards/${card.id}.html</guid><pubDate>${new Date(card.updated_at).toUTCString()}</pubDate><description><![CDATA[${convertWordPressMarkdownToHtml(readFolioleWebMarkdown(contents.get(card.id) ?? ''))}]]></description></item>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${escapeHtml(index.site.title)}</title><link>${siteAddress}/</link>${items}</channel></rss>`;
}

export function stageFoliolePublishSite(root: string, index: FoliolePublishIndex, siteAddress: string, overrides = new Map<string, { content: string; fields: FolioleWebField[] }>()) {
  const tutorial = index.cards.length === 0;
  const source = tutorial ? tutorialIndex() : index;
  const temporary = path.join(root, `.Site-${randomUUID()}`);
  const theme = readFoliolePublishTheme(root);
  fs.mkdirSync(path.join(temporary, 'cards'), { recursive: true });
  const contents = new Map<string, string>();
  source.cards.forEach((card, i) => {
    const selected = overrides.get(card.id) ?? (() => {
      const stored = readCard(root, card, tutorial);
      return { content: stored.markdown, fields: stored.fields };
    })();
    contents.set(card.id, selected.content);
    fs.writeFileSync(path.join(temporary, 'cards', `${card.id}.html`), cardPage({
      card, depth: '../', fields: selected.fields, markdown: selected.content,
      newer: i > 0 ? `./${source.cards[i - 1]?.id}.html` : null,
      older: i + 1 < source.cards.length ? `./${source.cards[i + 1]?.id}.html` : null,
      template: theme['page.html']
    }));
  });
  const latest = source.cards[0]!;
  const selected = overrides.get(latest.id) ?? (() => {
    const stored = readCard(root, latest, tutorial);
    return { content: stored.markdown, fields: stored.fields };
  })();
  fs.writeFileSync(path.join(temporary, 'index.html'), cardPage({ card: latest, depth: '', fields: selected.fields, markdown: selected.content, newer: null, older: source.cards[1] ? `cards/${source.cards[1].id}.html` : null, template: theme['page.html'] }));
  const archiveItems = source.cards.map((card) => `<li><a href="cards/${card.id}.html">${escapeHtml(card.title)}</a></li>`).join('');
  fs.writeFileSync(path.join(temporary, 'archive.html'), render(theme['archive.html'], { content: archiveItems, title: escapeHtml(source.site.title) }));
  fs.writeFileSync(path.join(temporary, 'style.css'), theme['style.css']);
  fs.writeFileSync(path.join(temporary, 'site.js'), theme['site.js']);
  fs.writeFileSync(path.join(temporary, 'rss.xml'), rss(source, contents, siteAddress || 'https://example.pages.dev'));
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
