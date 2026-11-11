import type { ArticleBody } from '../../platform/articleTarget.js';

import { escapeArticleHtml, renderArticleBodyBlocks } from './articleHtml.js';

export function renderMobileArticleHtml(article: ArticleBody, language: string) {
  const title = escapeArticleHtml(article.title);
  const body = renderArticleBodyBlocks(article).map(block => block.html).join('\n');
  return `<!doctype html><html lang="${escapeArticleHtml(language)}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>${title}</title><style>
:root { color-scheme:light dark; font-family:system-ui,sans-serif; }
body { max-width:42em; margin:auto; padding:1em; font-size:1.125rem; line-height:1.7; overflow-wrap:anywhere; }
pre,table { display:block; max-width:100%; overflow:auto; }
</style></head><body><main><article><h1>${title}</h1>${body}</article></main></body></html>`;
}
