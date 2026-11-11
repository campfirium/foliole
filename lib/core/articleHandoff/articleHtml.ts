import type { ArticleBody } from '../../platform/articleTarget.js';
import { splitMarkdownFrontmatter } from '../publishing/publishFrontmatter.js';
import { convertWordPressMarkdownToBlocks } from '../wordpress/wordpressMarkdownHtml.js';

export function escapeArticleHtml(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

export function renderArticleBodyBlocks(article: ArticleBody) {
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
