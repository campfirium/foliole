import fs from 'node:fs';
import path from 'node:path';

import { writeFileAtomic } from './foliolePublishModel.js';

const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>{{ page.title }}</title><link rel="alternate" type="application/rss+xml" href="{{ page.depth }}rss.xml"><link rel="stylesheet" href="{{ page.depth }}style.css"></head><body{% if page.archive_url %} data-archive-url="{{ page.archive_url }}"{% endif %}{% if page.newer_url %} data-newer-url="{{ page.newer_url }}"{% endif %}{% if page.older_url %} data-older-url="{{ page.older_url }}"{% endif %}><main><article><h1>{{ page.title }}</h1>{% if page.has_visible_fields %}<dl class="fields">{% for field in page.fields %}{% if field.values.size > 0 %}<dt>{{ field.key }}</dt><dd>{{ field.values | join: ", " }}</dd>{% endif %}{% endfor %}</dl>{% endif %}{{ page.content | raw }}</article></main><span class="hint">Space · Shift+Space · Esc</span><script src="{{ page.depth }}site.js"></script></body></html>`;
const ARCHIVE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>{{ page.title }}</title><link rel="stylesheet" href="{{ page.depth }}style.css"></head><body><main><h1>{{ page.title }}</h1><ol class="archive">{% for card in site.cards %}<li><a href="{{ page.depth }}{{ card.path }}">{{ card.title }}</a></li>{% endfor %}</ol></main></body></html>`;
const STYLE = `:root{color-scheme:light dark;font-family:ui-serif,Georgia,serif}*{box-sizing:border-box}body{margin:0;background:#f3efe7;color:#27241f}main{width:min(760px,calc(100% - 40px));margin:auto;min-height:100vh;padding:12vh 0 10vh}article{font-size:1.12rem;line-height:1.75}h1{font-size:clamp(2rem,6vw,4.8rem);line-height:1.02;margin:0 0 2.4rem}.fields{display:grid;grid-template-columns:max-content 1fr;gap:.45rem 1.2rem;margin:0 0 2rem;padding:1rem 0;border-block:1px solid #bbb}.fields dt{color:#777}.fields dd{margin:0}img{max-width:100%;border-radius:12px}pre{overflow:auto;padding:1rem;background:#1e1d1a;color:#eee;border-radius:10px}.hint{position:fixed;right:18px;bottom:14px;font:12px ui-sans-serif;color:#777}.archive{list-style:none;padding:0}.archive li{border-top:1px solid #bbb;padding:1.1rem 0}.archive a{color:inherit;text-decoration:none;font-size:1.35rem}@media(prefers-color-scheme:dark){body{background:#171715;color:#eee}.archive li,.fields{border-color:#444}}`;
const SCRIPT = `(function(){document.addEventListener('keydown',function(e){var d=document.body.dataset;if(e.key==='Escape'&&d.archiveUrl){location.href=d.archiveUrl;}if(e.code==='Space'){e.preventDefault();var u=e.shiftKey?d.newerUrl:d.olderUrl;if(u)location.href=u;}})})();`;
const FILES = { 'archive.html': ARCHIVE, 'page.html': PAGE, 'site.js': SCRIPT, 'style.css': STYLE };

export function resetFoliolePublishThemeFiles(root: string) {
  const theme = path.join(root, 'Theme');
  fs.mkdirSync(theme, { recursive: true });
  for (const [name, contents] of Object.entries(FILES)) writeFileAtomic(path.join(theme, name), contents);
  return theme;
}

export function ensureFoliolePublishTheme(root: string) {
  const theme = path.join(root, 'Theme');
  if (!fs.existsSync(theme)) return resetFoliolePublishThemeFiles(root);
  const missing = Object.keys(FILES).filter((name) => !fs.existsSync(path.join(theme, name)));
  if (missing.length > 0) throw new Error(`Theme is missing ${missing.join(', ')}. Use Reset theme to restore it.`);
  return theme;
}

export function readFoliolePublishTheme(root: string) {
  const theme = ensureFoliolePublishTheme(root);
  return Object.fromEntries(Object.keys(FILES).map((name) => [name, fs.readFileSync(path.join(theme, name), 'utf8')])) as Record<keyof typeof FILES, string>;
}
