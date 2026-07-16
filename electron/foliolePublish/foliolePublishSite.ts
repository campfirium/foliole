import fs from 'node:fs';
import path from 'node:path';

import { readWordPressPublishMarkdown } from '../../lib/core/wordpress/wordpressFrontmatter.js';
import { convertWordPressMarkdownToHtml } from '../../lib/core/wordpress/wordpressMarkdownHtml.js';

import type { FoliolePublishCard, FoliolePublishIndex } from './foliolePublishModel.js';

const STYLE = `:root{color-scheme:light dark;font-family:ui-serif,Georgia,serif}*{box-sizing:border-box}body{margin:0;background:#f3efe7;color:#27241f}main{width:min(760px,calc(100% - 40px));margin:auto;min-height:100vh;padding:12vh 0 10vh}article{font-size:1.12rem;line-height:1.75}h1{font-size:clamp(2rem,6vw,4.8rem);line-height:1.02;margin:0 0 2.4rem}img{max-width:100%;border-radius:12px}pre{overflow:auto;padding:1rem;background:#1e1d1a;color:#eee;border-radius:10px}.hint{position:fixed;right:18px;bottom:14px;font:12px ui-sans-serif;color:#777}.archive{list-style:none;padding:0}.archive li{border-top:1px solid #bbb;padding:1.1rem 0}.archive a{color:inherit;text-decoration:none;font-size:1.35rem}@media(prefers-color-scheme:dark){body{background:#171715;color:#eee}.archive li{border-color:#444}}`;

const SCRIPT = `(function(){document.addEventListener('keydown',function(e){if(e.key==='Escape'){location.href=window.__archive;}if(e.code==='Space'){e.preventDefault();var u=e.shiftKey?window.__newer:window.__older;if(u)location.href=u;}})})();`;

function escapeHtml(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function document(title: string, body: string, depth = '') {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(title)}</title><link rel="alternate" type="application/rss+xml" href="${depth}rss.xml"><link rel="stylesheet" href="${depth}style.css"></head><body>${body}<script src="${depth}site.js"></script></body></html>`;
}

function cardPage(card: FoliolePublishCard, markdown: string, newer: string | null, older: string | null, depth: string) {
  const links = `<script>window.__archive='${depth}archive.html';window.__newer=${JSON.stringify(newer)};window.__older=${JSON.stringify(older)};</script>`;
  const body = `<main><article><h1>${escapeHtml(card.title)}</h1>${convertWordPressMarkdownToHtml(readWordPressPublishMarkdown(markdown))}</article></main><span class="hint">Space · Shift+Space · Esc</span>${links}`;
  return document(card.title, body, depth);
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

function readCardMarkdown(root: string, card: FoliolePublishCard, tutorial: boolean) {
  if (tutorial) return TUTORIAL[Number(card.id.at(-1))] ?? '';
  return fs.readFileSync(path.join(root, card.file), 'utf8');
}

function rss(index: FoliolePublishIndex, contents: Map<string, string>, siteAddress: string) {
  const items = index.cards.map((card) => `<item><title>${escapeHtml(card.title)}</title><link>${siteAddress}/cards/${card.id}.html</link><guid>${siteAddress}/cards/${card.id}.html</guid><pubDate>${new Date(card.updated_at).toUTCString()}</pubDate><description><![CDATA[${convertWordPressMarkdownToHtml(readWordPressPublishMarkdown(contents.get(card.id) ?? ''))}]]></description></item>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${escapeHtml(index.site.title)}</title><link>${siteAddress}/</link>${items}</channel></rss>`;
}

export function generateFoliolePublishSite(root: string, index: FoliolePublishIndex, siteAddress: string) {
  const tutorial = index.cards.length === 0;
  const source = tutorial ? tutorialIndex() : index;
  const temporary = path.join(root, `.Site-${Date.now()}`);
  const destination = path.join(root, 'Site');
  const backup = path.join(root, `.Site-backup-${Date.now()}`);
  fs.mkdirSync(path.join(temporary, 'cards'), { recursive: true });
  const contents = new Map(source.cards.map((card) => [card.id, readCardMarkdown(root, card, tutorial)]));
  source.cards.forEach((card, i) => {
    const newer = i > 0 ? `./${source.cards[i - 1]?.id}.html` : null;
    const older = i + 1 < source.cards.length ? `./${source.cards[i + 1]?.id}.html` : null;
    fs.writeFileSync(path.join(temporary, 'cards', `${card.id}.html`), cardPage(card, contents.get(card.id) ?? '', newer, older, '../'));
  });
  const latest = source.cards[0]!;
  fs.writeFileSync(path.join(temporary, 'index.html'), cardPage(latest, contents.get(latest.id) ?? '', null, source.cards[1] ? `cards/${source.cards[1].id}.html` : null, ''));
  const archive = `<main><h1>${escapeHtml(source.site.title)}</h1><ol class="archive">${source.cards.map((card) => `<li><a href="cards/${card.id}.html">${escapeHtml(card.title)}</a></li>`).join('')}</ol></main>`;
  fs.writeFileSync(path.join(temporary, 'archive.html'), document(source.site.title, archive));
  fs.writeFileSync(path.join(temporary, 'style.css'), STYLE);
  fs.writeFileSync(path.join(temporary, 'site.js'), SCRIPT);
  fs.writeFileSync(path.join(temporary, 'rss.xml'), rss(source, contents, siteAddress || 'https://example.pages.dev'));
  try {
    if (fs.existsSync(destination)) fs.renameSync(destination, backup);
    fs.renameSync(temporary, destination);
    fs.rmSync(backup, { force: true, recursive: true });
  } catch (error) {
    if (!fs.existsSync(destination) && fs.existsSync(backup)) fs.renameSync(backup, destination);
    throw error;
  } finally {
    fs.rmSync(temporary, { force: true, recursive: true });
  }
  return path.join(destination, 'index.html');
}
