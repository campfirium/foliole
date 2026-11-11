import { splitMarkdownFrontmatter } from '../../lib/core/publishing/publishFrontmatter.js';
import { convertWordPressMarkdownToBlocks } from '../../lib/core/wordpress/wordpressMarkdownHtml.js';

export interface EdgeReadingArticle {
  title: string;
  markdown: string;
  leafSvg: string;
  language: string;
  contentsLabel: string;
}

function escapeHtml(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function renderSidebar(article: EdgeReadingArticle, links: string[]) {
  const logo = Buffer.from(article.leafSvg).toString('base64');
  const label = escapeHtml(article.contentsLabel);
  const navigation = links.length ? `<nav aria-label="${label}"><h2>${label}</h2>${links.join('')}</nav>` : '';
  return `<!doctype html><html lang="${escapeHtml(article.language)}"><meta charset="utf-8">
<style>
body { margin:0; padding:2px 12px 16px 0; color:#595959; font:15px/1.5 system-ui,sans-serif; }
img { display:block; width:auto; height:54px; object-fit:contain; margin:0 0 20px; filter:grayscale(1); opacity:.11; }
h2 { margin:0 0 6px; font-size:inherit; font-weight:600; }
a { display:block; width:fit-content; padding:6px 0; color:inherit; text-decoration:none; overflow-wrap:anywhere; }
a:hover, a:focus-visible { color:#111; text-decoration:underline; text-underline-offset:.2em; }
</style>
<img src="data:image/svg+xml;base64,${logo}" alt="">${navigation}</html>`;
}

function renderArticle(article: EdgeReadingArticle) {
  let markdown = article.markdown;
  try {
    markdown = splitMarkdownFrontmatter(markdown, (message) => new Error(message)).body;
  } catch {
    // An unmatched opening rule can be part of an ordinary article.
  }
  const blocks = convertWordPressMarkdownToBlocks(markdown, 1, { preserveSoftBreaks: true });
  if (/^ATXHeading1$/u.test(blocks[0]?.kind ?? '') && blocks[0]?.text === article.title.trim()) {
    blocks.shift();
  }
  const links: string[] = [];
  const body = blocks.map((block, index) => {
    if (!/^ATXHeading[1-6]$/u.test(block.kind) || !block.text) return block.html;
    const anchor = `section-${index}`;
    links.push(`<a href="index.html#${anchor}" target="_parent">${escapeHtml(block.text)}</a>`);
    return block.html.replace(/^<h[2-6]/u, (tag) => `${tag} id="${anchor}"`);
  });
  return { body: body.join('\n'), links };
}

export function renderEdgeReadingPage(article: EdgeReadingArticle) {
  const title = escapeHtml(article.title);
  const { body, links } = renderArticle(article);
  const sidebar = escapeHtml(renderSidebar(article, links));
  return `<!doctype html><html lang="${escapeHtml(article.language)}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src 'self' about:; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>${title}</title><style>
:root { color-scheme:light; background:white; color:#181818; font-family:system-ui,sans-serif; }
body { max-width:1050px; margin:auto; padding:60px clamp(18px,6vw,88px) 90px; display:grid;
  grid-template-columns:clamp(88px,17vw,196px) minmax(0,1fr); gap:clamp(16px,5vw,80px); align-items:start; }
iframe { position:sticky; top:38px; border:0; width:100%; height:80vh; }
article { max-width:41em; font-size:clamp(16px,1.65vw,19px); line-height:1.85; overflow-wrap:anywhere; }
h1 { font-size:54px; line-height:1.16; margin:0 0 24px; }
h2,h3,h4,h5,h6 { scroll-margin-top:38px; line-height:1.5; }
p { margin:0 0 1em; }
pre,table { display:block; max-width:100%; overflow:auto; }
img { max-width:100%; height:auto; }
</style></head><body>
<iframe title="${escapeHtml(article.contentsLabel)}" srcdoc="${sidebar}"></iframe>
<main><article><h1>${title}</h1>${body}</article></main></body></html>`;
}
