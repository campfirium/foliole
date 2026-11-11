import type { ArticleBody } from '../../platform/articleTarget.js';
import { splitMarkdownFrontmatter } from '../publishing/publishFrontmatter.js';
import { convertWordPressMarkdownToBlocks } from '../wordpress/wordpressMarkdownHtml.js';

export function escapeArticleHtml(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function renderArticleBodyBlocks(article: ArticleBody) {
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
  return blocks;
}

export function renderArticleBodyWithSections(article: ArticleBody) {
  const sections: { anchor: string; title: string }[] = [];
  const body = renderArticleBodyBlocks(article).map((block, index) => {
    if (!/^ATXHeading[1-6]$/u.test(block.kind) || !block.text) return block.html;
    const anchor = `section-${index}`;
    sections.push({ anchor, title: block.text });
    return block.html.replace(/^<h[2-6]/u, (tag) => `${tag} id="${anchor}"`);
  });
  return { body: body.join('\n'), sections };
}
